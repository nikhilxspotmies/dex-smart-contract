import { getContract, readContract } from "thirdweb";
import { getRpcClient, eth_getBalance } from "thirdweb/rpc";
import { client, chain } from "../utils/client.js";
import { TOKEN_WHITELIST, QUOTE_TOKEN } from "../constants/tokens.js";
import type { WhitelistToken } from "../constants/tokens.js";
import { TRADERS } from "../constants/whales.js";
import WhaleSnapshot from "../models/WhaleSnapshot.js";

const FACTORY_ADDRESS = process.env.COPY_TRADING_FACTORY_ADDRESS || "0xe6e340d132b5f46d1e472debcd681b2abc16e57e";
const ROUTER_ADDRESS = process.env.DEX_ROUTER_ADDRESS;

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const VAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

interface VaultInfo {
    address: string;
    owner: string;
    targetWhale: string;
}

/**
 * Computes real, on-chain-derived whale stats — follower count (vaults targeting a
 * whale) and portfolio USD value (for ROI/PnL) — replacing the hardcoded literals
 * that used to live in constants/whales.ts. Scope is deliberately Amerox-only: it
 * only sees balances/activity observable via our own Factory/Router, not a whale's
 * full BSC history (see plan doc for why).
 */
export class WhaleStatsService {
    private factoryContract: any;
    private routerContract: any;
    private vaultCache: VaultInfo[] = [];
    private vaultCacheAt: number = 0;
    private snapshotTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.factoryContract = getContract({ client, chain, address: FACTORY_ADDRESS });
        if (ROUTER_ADDRESS) {
            this.routerContract = getContract({ client, chain, address: ROUTER_ADDRESS });
        } else {
            console.error("WhaleStatsService: DEX_ROUTER_ADDRESS not set — portfolio pricing will fail.");
        }
    }

    /**
     * Walks CopyTradingFactory.allVaults(i) from 0 until the call reverts (there is
     * no length getter on the array) — same discovery approach as
     * copy_trading_engine/src/managers/VaultManager.ts. Cached briefly so a burst of
     * /api/whales requests doesn't re-walk every vault each time.
     */
    private async getAllVaults(): Promise<VaultInfo[]> {
        if (Date.now() - this.vaultCacheAt < VAULT_CACHE_TTL_MS && this.vaultCache.length > 0) {
            return this.vaultCache;
        }

        const vaults: VaultInfo[] = [];
        let index = 0;
        const MAX_VAULTS = 5000; // safety break, not an expected real count

        while (index < MAX_VAULTS) {
            let vaultAddress: string;
            try {
                vaultAddress = await readContract({
                    contract: this.factoryContract,
                    method: "function allVaults(uint256) view returns (address)",
                    params: [BigInt(index)],
                }) as string;
            } catch {
                break; // out of bounds — end of the array
            }

            if (!vaultAddress || vaultAddress === "0x0000000000000000000000000000000000000000") break;

            try {
                const vaultContract = getContract({ client, chain, address: vaultAddress });
                const [owner, targetWhale] = await Promise.all([
                    readContract({ contract: vaultContract, method: "function owner() view returns (address)", params: [] }) as Promise<string>,
                    readContract({ contract: vaultContract, method: "function targetWhale() view returns (address)", params: [] }) as Promise<string>,
                ]);
                vaults.push({ address: vaultAddress, owner, targetWhale });
            } catch (e) {
                console.error(`WhaleStatsService: failed to read vault ${vaultAddress}:`, e);
            }

            index++;
        }

        this.vaultCache = vaults;
        this.vaultCacheAt = Date.now();
        return vaults;
    }

    async getFollowerCount(whaleAddress: string): Promise<number> {
        const vaults = await this.getAllVaults();
        const target = whaleAddress.toLowerCase();
        return vaults.filter(v => v.targetWhale?.toLowerCase() === target).length;
    }

    /** Current USD value of `address`'s balances across TOKEN_WHITELIST, quoted in USDT. */
    async getPortfolioValueUsd(address: string): Promise<number> {
        if (!this.routerContract) return 0;

        let totalUsd = 0;

        for (const token of TOKEN_WHITELIST) {
            try {
                const tokenContract = getContract({ client, chain, address: token.address });
                const balance = await readContract({
                    contract: tokenContract,
                    method: "function balanceOf(address account) view returns (uint256)",
                    params: [address],
                }) as bigint;

                if (balance === 0n) continue;

                const priceUsd = await this.getPriceUsd(token);
                const formattedBalance = Number(balance) / 10 ** token.decimals;
                totalUsd += formattedBalance * priceUsd;
            } catch (e) {
                // No liquidity for this token, or balanceOf reverted — treat as $0 contribution
                console.warn(`WhaleStatsService: could not price ${token.symbol} for ${address}:`, (e as Error).message);
            }
        }

        // Native BNB is a very common whale holding (unlike its ERC-20 wrapper WBNB) and
        // is otherwise invisible to a balanceOf loop — priced via WBNB's own quote, since
        // they're 1:1, same assumption Amerox-dex/src/utils/tokenConfig.ts makes for the
        // native BNB pseudo-token entry.
        const wbnb = TOKEN_WHITELIST.find(t => t.symbol === "WBNB");
        if (wbnb) {
            try {
                const rpcRequest = getRpcClient({ client, chain });
                const nativeBalance = await eth_getBalance(rpcRequest, { address });
                if (nativeBalance > 0n) {
                    const priceUsd = await this.getPriceUsd(wbnb);
                    totalUsd += (Number(nativeBalance) / 1e18) * priceUsd;
                }
            } catch (e) {
                console.warn(`WhaleStatsService: could not price native BNB for ${address}:`, (e as Error).message);
            }
        }

        return totalUsd;
    }

    /** USD price of one whole unit of `token`, via the Router's own pool quote. $1 for the quote token itself. */
    private async getPriceUsd(token: WhitelistToken): Promise<number> {
        if (token.address.toLowerCase() === QUOTE_TOKEN.address.toLowerCase()) return 1;

        const oneUnit = 10n ** BigInt(token.decimals);
        const amounts = await readContract({
            contract: this.routerContract,
            method: "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
            params: [oneUnit, [token.address, QUOTE_TOKEN.address]],
        }) as bigint[];
        return Number(amounts[1]) / 10 ** QUOTE_TOKEN.decimals;
    }

    /** Earliest and latest recorded snapshot for a whale, or nulls if fewer than 2 exist. */
    async getRoiAndPnl(whaleAddress: string): Promise<{ roiPct: number | null; pnlUsd: number | null; trackingSince: Date | null }> {
        const address = whaleAddress.toLowerCase();
        const [first, latest] = await Promise.all([
            WhaleSnapshot.findOne({ whaleAddress: address }).sort({ timestamp: 1 }),
            WhaleSnapshot.findOne({ whaleAddress: address }).sort({ timestamp: -1 }),
        ]);

        if (!first || !latest || first._id.equals(latest._id)) {
            return { roiPct: null, pnlUsd: null, trackingSince: first?.timestamp ?? null };
        }

        const pnlUsd = latest.valueUsd - first.valueUsd;
        const roiPct = first.valueUsd > 0 ? (pnlUsd / first.valueUsd) * 100 : null;

        return { roiPct, pnlUsd, trackingSince: first.timestamp };
    }

    private async takeSnapshots() {
        for (const trader of TRADERS) {
            try {
                const valueUsd = await this.getPortfolioValueUsd(trader.address);
                await WhaleSnapshot.create({ whaleAddress: trader.address.toLowerCase(), valueUsd });
                console.log(`WhaleStatsService: snapshot for ${trader.name} (${trader.address}) = $${valueUsd.toFixed(2)}`);
            } catch (e) {
                console.error(`WhaleStatsService: failed to snapshot ${trader.name}:`, e);
            }
        }
    }

    start() {
        if (this.snapshotTimer) return;
        this.takeSnapshots().catch(e => console.error("WhaleStatsService: initial snapshot failed:", e));
        this.snapshotTimer = setInterval(() => {
            this.takeSnapshots().catch(e => console.error("WhaleStatsService: scheduled snapshot failed:", e));
        }, SNAPSHOT_INTERVAL_MS);
        console.log("WhaleStatsService started (hourly portfolio snapshots).");
    }
}

export const whaleStatsService = new WhaleStatsService();
