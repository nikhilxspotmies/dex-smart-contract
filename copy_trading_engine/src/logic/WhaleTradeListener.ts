import { ethers } from "ethers";
import { ROUTER_ADDRESS, ROUTER_ABI, ERC20_ABI } from "../config/contracts.js";
import { VaultManager } from "../managers/VaultManager.js";
import type { VaultInfo } from "../managers/VaultManager.js";
import { PortfolioAnalyzer } from "./Portfolio.js";
import { TradeExecutor } from "./Executor.js";

/**
 * Real-time trade mirroring: replaces the old 30s balance-snapshot rebalance loop's
 * core trigger. Subscribes to Router.SwapExecuted and, on a trade from a tracked
 * whale, mirrors it into each follower's vault sized to THAT follower's own holdings
 * — not the whale's absolute amount. See the copy-trading implementation plan for why
 * this replaced the old design (it never saw individual trades, only a periodic
 * balance diff).
 */

// Never move more than this % of a follower's own holding of the token being sold, in
// one mirrored trade. Deliberately balanceOf-based (not USD-value-based) so it still
// works while AMM pools have no liquidity to price against.
const PER_TRADE_CAP_BPS = 2500n; // 25%, per plan decision

// Circuit breaker: pause mirroring a whale whose portfolio value drops this much...
const CIRCUIT_BREAKER_DROP_PCT = 0.20; // 20%, per plan decision
// ...within this trailing window.
const CIRCUIT_BREAKER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const WHALE_REFRESH_INTERVAL_MS = 60 * 1000;

interface ValueSample {
    t: number;
    v: number;
}

export class WhaleTradeListener {
    private provider: ethers.Provider;
    private routerContract: ethers.Contract;
    private vaultManager: VaultManager;
    private portfolioAnalyzer: PortfolioAnalyzer;
    private tradeExecutor: TradeExecutor;

    private trackedWhales: Set<string> = new Set();
    private valueHistory: Map<string, ValueSample[]> = new Map();
    private pausedWhales: Set<string> = new Set();

    constructor(
        provider: ethers.Provider,
        vaultManager: VaultManager,
        portfolioAnalyzer: PortfolioAnalyzer,
        tradeExecutor: TradeExecutor
    ) {
        this.provider = provider;
        this.routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
        this.vaultManager = vaultManager;
        this.portfolioAnalyzer = portfolioAnalyzer;
        this.tradeExecutor = tradeExecutor;
    }

    // Serializes every handleSwap() call (including all the follower sends inside it)
    // through a single promise chain, so two whale trades landing close together can
    // never send mirrored transactions concurrently from this engine's one signer —
    // eliminates the nonce race that would otherwise be possible across events.
    private queue: Promise<void> = Promise.resolve();

    async start() {
        await this.refreshTrackedWhales();
        setInterval(() => {
            this.refreshTrackedWhales().catch(e => console.error("[WhaleTradeListener] refresh failed:", e));
        }, WHALE_REFRESH_INTERVAL_MS);

        this.routerContract.on("SwapExecuted", (sender: string, path: string[], amounts: bigint[], _to: string, event: ethers.ContractEventPayload) => {
            this.queue = this.queue
                .then(() => this.handleSwap(sender, path, amounts, event.log.blockNumber))
                .catch(e => console.error("[WhaleTradeListener] handler failed:", e));
        });

        console.log(`[WhaleTradeListener] Watching Router.SwapExecuted at ${ROUTER_ADDRESS}`);
    }

    /** Refreshes which whales currently have followers, and takes a portfolio-value sample for the circuit breaker. */
    private async refreshTrackedWhales() {
        const vaults = await this.vaultManager.getAllVaults();
        const whales = new Set<string>();
        for (const v of vaults) {
            if (v.targetWhale !== ethers.ZeroAddress) whales.add(v.targetWhale.toLowerCase());
        }
        this.trackedWhales = whales;

        for (const whale of whales) {
            try {
                const portfolio = await this.portfolioAnalyzer.calculatePortfolio(whale, false);
                this.recordSample(whale, portfolio.totalValueUsd);
            } catch (e) {
                console.error(`[WhaleTradeListener] failed to sample ${whale}:`, e);
            }
        }
    }

    private recordSample(whale: string, valueUsd: number) {
        const now = Date.now();
        const history = this.valueHistory.get(whale) ?? [];
        history.push({ t: now, v: valueUsd });

        const pruneCutoff = now - CIRCUIT_BREAKER_WINDOW_MS * 2;
        while (history.length > 0 && history[0] !== undefined && history[0].t < pruneCutoff) {
            history.shift();
        }
        this.valueHistory.set(whale, history);

        const windowStart = now - CIRCUIT_BREAKER_WINDOW_MS;
        const baseline = history.find(s => s.t >= windowStart);
        if (!baseline || baseline.v <= 0) return;

        const dropPct = (baseline.v - valueUsd) / baseline.v;
        const wasPaused = this.pausedWhales.has(whale);

        if (dropPct >= CIRCUIT_BREAKER_DROP_PCT) {
            if (!wasPaused) {
                console.warn(
                    `[WhaleTradeListener] CIRCUIT BREAKER: ${whale} portfolio dropped ${(dropPct * 100).toFixed(1)}% ` +
                    `within the window ($${baseline.v.toFixed(2)} -> $${valueUsd.toFixed(2)}). Pausing mirroring.`
                );
            }
            this.pausedWhales.add(whale);
        } else if (wasPaused) {
            console.log(`[WhaleTradeListener] ${whale} portfolio recovered — resuming mirroring.`);
            this.pausedWhales.delete(whale);
        }
    }

    private async handleSwap(sender: string, path: string[], amounts: bigint[], blockNumber: number) {
        const whale = sender.toLowerCase();
        if (!this.trackedWhales.has(whale)) return; // nobody follows this address, ignore cheaply

        if (this.pausedWhales.has(whale)) {
            console.log(`[WhaleTradeListener] Ignoring trade from ${whale} — circuit breaker active.`);
            return;
        }

        if (!path || path.length < 2 || !amounts || amounts.length < 2) return;
        const tokenIn = path[0];
        const tokenOut = path[path.length - 1];
        const amountIn = amounts[0];
        if (!tokenIn || !tokenOut || amountIn === undefined) return;

        // Pre-trade balance, read directly at the block before this trade — not
        // reconstructed from a later "current" read, which would race with any
        // further trades the whale fires on the same token before this handler gets
        // to it (events are processed serially via `queue`, but a fast-moving whale
        // could still get ahead of a slow RPC response). Pinning to blockNumber - 1
        // makes this deterministic regardless of what's happened since.
        const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, this.provider);
        let whaleBalanceBefore: bigint;
        try {
            whaleBalanceBefore = await (tokenInContract as any).balanceOf(sender, { blockTag: blockNumber - 1 });
        } catch (e) {
            console.error(`[WhaleTradeListener] failed to read whale pre-trade balance of ${tokenIn}:`, e);
            return;
        }
        if (whaleBalanceBefore === 0n) return;

        const fractionNum = amountIn > whaleBalanceBefore ? whaleBalanceBefore : amountIn;
        const fractionDen = whaleBalanceBefore;

        const vaults = await this.vaultManager.getAllVaults();
        const followers = vaults.filter(v => v.targetWhale.toLowerCase() === whale);

        console.log(`[WhaleTradeListener] Whale ${whale} sold ${amountIn} of ${tokenIn} for ${tokenOut} (${followers.length} follower(s))`);

        for (const follower of followers) {
            try {
                await this.mirrorForFollower(follower, tokenIn, tokenOut, fractionNum, fractionDen);
            } catch (e) {
                console.error(`[WhaleTradeListener] mirror failed for vault ${follower.address}:`, e);
            }
        }
    }

    private async mirrorForFollower(follower: VaultInfo, tokenIn: string, tokenOut: string, fractionNum: bigint, fractionDen: bigint) {
        const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, this.provider);
        const followerBalance: bigint = await (tokenInContract as any).balanceOf(follower.address);

        if (followerBalance === 0n) {
            console.log(`[WhaleTradeListener] Skipping ${follower.address} — no ${tokenIn} balance to mirror with.`);
            return;
        }

        let sellAmount = (followerBalance * fractionNum) / fractionDen;

        const cap = (followerBalance * PER_TRADE_CAP_BPS) / 10000n;
        if (sellAmount > cap) sellAmount = cap;

        if (sellAmount === 0n) return;

        const swap = await this.tradeExecutor.constructSwap(tokenIn, tokenOut, sellAmount, follower.address);
        if (!swap) return;

        await this.tradeExecutor.executeRebalance(follower.address, [swap], follower.owner);
    }
}
