import { ethers } from "ethers";
import cron from "node-cron";
import { PRIVATE_KEY, RPC_URL, resolveTokenDecimals } from "./config/contracts.js";
import { VaultManager } from "./managers/VaultManager.js";
import { PortfolioAnalyzer } from "./logic/Portfolio.js";
import { TradeExecutor } from "./logic/Executor.js";
import { WhaleTradeListener } from "./logic/WhaleTradeListener.js";

// Setup Provider & Signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Initialize Components
const vaultManager = new VaultManager(provider);
const portfolioAnalyzer = new PortfolioAnalyzer(provider);
const tradeExecutor = new TradeExecutor(wallet);
const whaleTradeListener = new WhaleTradeListener(provider, vaultManager, portfolioAnalyzer, tradeExecutor);

let isProcessing = false;

/**
 * Slow reconciliation backstop — no longer the primary trigger. WhaleTradeListener
 * mirrors trades in near-real-time off Router.SwapExecuted; this still runs
 * infrequently (see bootstrap()) as a safety net in case an event is ever missed, and
 * to eventually converge any vault that's drifted for other reasons (e.g. a follower
 * deposited more funds). Kept intentionally close to its original form since it's
 * proven, working code — only its role and frequency changed.
 */
async function runEngine() {
    if (isProcessing) {
        console.log("Engine busy, skipping cycle.");
        return;
    }
    isProcessing = true;
    console.log(`\n--- Engine Cycle Started [${new Date().toISOString()}] ---`);

    try {
        // 1. Discover All User Vaults
        const vaults = await vaultManager.getAllVaults();
        console.log(`Found ${vaults.length} vaults.`);

        for (const vault of vaults) {
            if (vault.targetWhale === ethers.ZeroAddress) continue;

            console.log(`Processing Vault: ${vault.address} (Owner: ${vault.owner}) copying Whale: ${vault.targetWhale}`);

            // 2. Analyze Portfolios
            const userPortfolio = await portfolioAnalyzer.calculatePortfolio(vault.address, true);
            const whalePortfolio = await portfolioAnalyzer.calculatePortfolio(vault.targetWhale, false);

            if (whalePortfolio.totalValueUsd === 0) {
                console.log("Whale portfolio empty, skipping.");
                continue;
            }

            // 3. Find Deviations (User vs Whale)
            const deviations = portfolioAnalyzer.findDeviations(userPortfolio, whalePortfolio);

            if (deviations.length === 0) {
                console.log("Aligned. No action needed.");
                continue;
            }

            // 4. Plan Trades
            // Logic: If deviation says BUY Token B (underweight), find something to SELL.
            // Simplified Logic: 
            // - Look for 'SELL' deviations (Overweight).
            // - Swap that Overweight Token -> Underweight Token (BUY).

            const buys = deviations.filter(d => d.type === 'BUY');
            const sells = deviations.filter(d => d.type === 'SELL');

            // Basic matching strategy: Take first Sell and use it to buy first Buy
            const swaps = [];

            if (buys.length > 0 && sells.length > 0) {
                const sellDev = sells[0]; // Token we have too much of
                const buyDev = buys[0];   // Token we need

                if (!sellDev || !buyDev) continue;

                // Get available balance of sell token
                const sellItem = userPortfolio.items.find(i => i.token === sellDev.token);
                if (sellItem && sellItem.balance > 0n) {
                    // Decide amount: 10% of holdings to converge slowly
                    const amountToSell = sellItem.balance / 10n;

                    if (amountToSell > 0n) {
                        const swap = await tradeExecutor.constructSwap(
                            sellDev.token,
                            buyDev.token,
                            amountToSell,
                            vault.address
                        );
                        if (swap) swaps.push(swap);
                    } else {
                        console.log(`[Info] Sell amount too small for ${sellDev.symbol}`);
                    }
                } else {
                    console.log(`[Info] Vault has 0 balance of ${sellDev.symbol}, cannot sell.`);
                }
            } else {
                if (buys.length > 0 && sells.length === 0) {
                    console.log("[Info] Needs to BUY but has NO SELLS (Vault likely empty or all-in on wrong token).");
                } else if (sells.length > 0 && buys.length === 0) {
                    console.log("[Info] Needs to SELL but nothing to BUY (Unusual state).");
                }
            }

            // 5. Execute Trades
            if (swaps.length > 0) {
                await tradeExecutor.executeRebalance(vault.address, swaps, vault.owner);
            }
        }

    } catch (e) {
        console.error("Fatal Engine Error:", e);
    } finally {
        isProcessing = false;
        console.log("--- Engine Cycle Finished ---");
    }
}

// Resolve token decimals on-chain, then start the engine.
async function bootstrap() {
    await resolveTokenDecimals(provider);

    // Primary trigger: real-time trade mirroring off Router.SwapExecuted.
    await whaleTradeListener.start();

    // Backstop: reconciliation pass every 30 min (was every 30s when this was the
    // only mechanism) — catches anything the event-driven path missed.
    cron.schedule('*/30 * * * *', runEngine);

    console.log("Copy Trading Engine V2 Initialized (event-driven + 30min backstop).");
    runEngine();
}

bootstrap();
