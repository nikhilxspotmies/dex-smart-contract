
import { getContract, readContract, prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";
import { client, chain } from "../utils/client.js";
import { privateKeyToAccount } from "thirdweb/wallets";
import PerpTrade, { TradeStatus } from "../models/PerpTrade.js";
import { config } from "dotenv";

config();

const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS;

if (!MARKET_ADDRESS) {
    console.error("Missing PERP_MARKET_ADDRESS");
}

const POLL_INTERVAL = 10000; // 10 seconds

// Constants from Market.sol
const WAD = 10n ** 18n;
const USDC_DECIMALS = 6n;
const FEE_BPS = 10n;
const BPS_DIV = 10000n;
const MAINT_MARGIN_BPS = 500n; // 5%

// Helper: USD (1e18) to USDC (1e6)
function usdToUsdc(usdAmount: bigint): bigint {
    return usdAmount / (10n ** 12n);
}

export class LiquidationKeeper {
    private isRunning: boolean = false;
    private account: any;

    constructor() {
        if (!process.env.PRIVATE_KEY) {
            console.error("PRIVATE_KEY missing for Keeper");
            return;
        }
        this.account = privateKeyToAccount({
            client,
            privateKey: process.env.PRIVATE_KEY as string,
        });
        console.log("LiquidationKeeper initialized with account:", this.account.address);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
    }

    private async loop() {
        if (!this.isRunning) return;

        try {
            await this.checkAndLiquidate();
        } catch (error) {
            console.error("Error in LiquidationKeeper loop:", error);
        }

        setTimeout(() => this.loop(), POLL_INTERVAL);
    }

    private async checkAndLiquidate() {
        if (!MARKET_ADDRESS) return;

        // 1. Get Open Trades
        const trades = await PerpTrade.find({ status: TradeStatus.OPEN });
        if (trades.length === 0) return;

        // 2. Get Market Data (Price + PositionManager Address)
        // We reuse the contract definition
        const marketContract = getContract({
            client,
            chain,
            address: MARKET_ADDRESS
        });

        // Fetch Price
        // function getOraclePrice() public view returns (uint256)
        const price = await readContract({
            contract: marketContract,
            method: "function getOraclePrice() public view returns (uint256)",
            params: [],
        }) as bigint;

        // Fetch Position Manager Address
        // function positionManager() public view returns (address)
        const pmAddress = await readContract({
            contract: marketContract,
            method: "function positionManager() public view returns (address)",
            params: [],
        }) as string;

        const pmContract = getContract({
            client,
            chain,
            address: pmAddress
        });

        console.log(`[Keeper] Checking ${trades.length} positions at price $${Number(price) / 1e18}...`);

        for (const trade of trades) {
            try {
                // Perform Off-chain Calculation First (Gas Saving)
                if (this.isLiquidatable(trade, price)) {
                    console.log(`[Keeper] Position ${trade.positionId} is UNHEALTHY. Attempting liquidation...`);

                    // Verify on-chain (optional double check, or just send)
                    // We call PositionManager.liquidate(market, positionId)

                    const tx = prepareContractCall({
                        contract: pmContract,
                        method: "function liquidate(address market, uint256 positionId) external",
                        params: [MARKET_ADDRESS, BigInt(trade.positionId)]
                    });

                    // Send transaction
                    const transactionResult = await sendTransaction({
                        transaction: tx,
                        account: this.account
                    });

                    console.log(`[Keeper] Liquidation TX Sent: ${transactionResult.transactionHash}`);

                    // Wait for receipt? The Event Listener will update the DB.
                    // But we can wait to log success.
                    const receipt = await waitForReceipt(transactionResult);
                    console.log(`[Keeper] Liquidation Confirmed in block ${receipt.blockNumber}`);

                }
            } catch (err: any) {
                console.error(`[Keeper] Failed to process position ${trade.positionId}:`, err);

                // Self-Healing: If contract says "no pos", it means the position is already closed/liquidated on-chain.
                // We must update our stale DB to stop the loop.
                const errorMessage = err.toString() + (err.message || "");
                if (errorMessage.includes("no pos")) {
                    console.warn(`[Keeper] Self-Healing: Position ${trade.positionId} does not exist on-chain ("no pos"). Marking as CLOSED.`);
                    trade.status = TradeStatus.CLOSED;
                    trade.closeTxHash = "0x_DESYNC_FIX";
                    trade.closedAt = new Date();
                    trade.size = "0";
                    trade.collateral = "0";
                    await trade.save();
                }
            }
        }
    }

    private isLiquidatable(trade: any, currentPrice: bigint): boolean {
        // Replicate Market.sol Logic
        /*
        uint256 notional = p.size; // USD 1e18
        uint256 mmRequirement = (notional * MAINT_MARGIN_BPS) / BPS_DIV; // 1e18
        uint256 mmUsdc = _usdToUsdc(mmRequirement);

        int256 pnl = _calculatePnl(p, p.size, price);
        pnl += fundingPnl; // IGNORE FUNDING FOR NOW (Assume small/conservative)
        
        uint256 collateralPlusPnl = ...
        require(collateralPlusPnl < mmUsdc, "healthy");
        */

        const size = BigInt(trade.size); // 1e18 NOTIONAL
        // Check: stored size is NOTIONAL or COLLATERAL?
        // PerpTrade.ts: "size: string; // USD Notionals " -> Correct.

        const collateral = BigInt(trade.collateral); // 1e6 USDC
        const entryPrice = BigInt(trade.entryPrice); // 1e18
        const isLong = trade.type === 'LONG';

        // 1. Calculate PnL
        // PnL = size * (price - entry) / entry
        // 1e18 * 1e18 / 1e18 = 1e18

        let pnl: bigint;
        if (isLong) {
            pnl = (size * (currentPrice - entryPrice)) / entryPrice;
        } else {
            pnl = (size * (entryPrice - currentPrice)) / entryPrice;
        }

        // 2. Ignore Funding for fast check (Funding usually reduces margin, so if we ignore it, we might overestimate health. 
        // If we want to be aggressive, we should fetch position funding. 
        // For MVP, we ignore funding (assume 0). 
        // If PnL is negative enough without funding, it's definitely liquidatable.

        // 3. Calculate Equity (Collateral + PnL)
        // Convert PnL (1e18) to USDC (1e6)
        let pnlUsdc = usdToUsdc(pnl > 0n ? pnl : -pnl);

        let equityUsdc: bigint;
        if (pnl >= 0n) {
            equityUsdc = collateral + pnlUsdc;
        } else {
            if (pnlUsdc >= collateral) {
                equityUsdc = 0n;
            } else {
                equityUsdc = collateral - pnlUsdc;
            }
        }

        // 4. Calculate Maintenance Margin
        const mmRequirementUsd = (size * MAINT_MARGIN_BPS) / BPS_DIV;
        const mmRequirementUsdc = usdToUsdc(mmRequirementUsd);

        // 5. Check
        // Liquidate if Equity < MM
        const isUnhealthy = equityUsdc < mmRequirementUsdc;

        if (isUnhealthy) {
            console.log(`[Check] Pos ${trade.positionId}: Equity ${equityUsdc} < MM ${mmRequirementUsdc}. PnL: ${pnl}`);
        }

        return isUnhealthy;
    }
}
