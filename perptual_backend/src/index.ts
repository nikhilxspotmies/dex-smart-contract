import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || "";
const PM_ADDRESS = process.env.PERP_POSITION_MANAGER_ADDRESS || "";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!RPC_URL || !PRIVATE_KEY || !MARKET_ADDRESS || !PM_ADDRESS) {
    console.error("Missing env vars");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const MARKET_ABI = [
    "function nextPositionId() view returns (uint256)",
    "function positions(uint256) view returns (uint256 size, uint256 collateral, uint256 entryPrice, int256 fundingEntry, bool isLong)",
    "function getOraclePrice() view returns (uint256)",
    "function cumulativeFundingLong() view returns (int256)",
    "function cumulativeFundingShort() view returns (int256)",
    "function quoteScale() view returns (uint256)"
];

const PM_ABI = [
    "function liquidate(address market, uint256 positionId) external"
];

const market = new ethers.Contract(MARKET_ADDRESS, MARKET_ABI, wallet);
const pm = new ethers.Contract(PM_ADDRESS, PM_ABI, wallet);

const MAINT_MARGIN_BPS = 500n; // 5%
const BPS_DIV = 10000n;
const WAD = 10n ** 18n;

async function run() {
    console.log("Starting liquidation bot...");
    console.log(`Dry Run: ${DRY_RUN}`);

    while (true) {
        try {
            const nextId = await market.nextPositionId();
            const price = await market.getOraclePrice();
            const fundingLong = await market.cumulativeFundingLong();
            const fundingShort = await market.cumulativeFundingShort();
            const quoteScale = await market.quoteScale();

            console.log(`Current Price: ${ethers.formatUnits(price, 18)}, Max Position ID: ${nextId}`);

            // Batch size for processing could be added here, currently sequential
            for (let i = 1; i < Number(nextId); i++) {
                try {
                    const pos = await market.positions(i);
                    if (pos.size === 0n) continue;

                    // Calculate PnL
                    // PnL = size * (price - entry) / entry
                    const priceDiff = BigInt(price) - BigInt(pos.entryPrice);
                    let pnl = (BigInt(pos.size) * priceDiff) / BigInt(pos.entryPrice);
                    if (!pos.isLong) pnl = -pnl;

                    // Funding PnL
                    const cumulative = pos.isLong ? fundingLong : fundingShort;
                    const fundingPnl = (BigInt(pos.size) * (BigInt(cumulative) - BigInt(pos.fundingEntry))) / WAD;

                    const totalPnl = pnl + fundingPnl;

                    // Maintenance Margin Logic
                    const notional = BigInt(pos.size);
                    const mmRequirement = (notional * MAINT_MARGIN_BPS) / BPS_DIV;
                    const mmUsdc = mmRequirement / quoteScale; // Convert to USDC decimals

                    let collateralPlusPnl = 0n;
                    const pnlUsdc = totalPnl >= 0n ? (totalPnl / quoteScale) : (-totalPnl / quoteScale);

                    if (totalPnl >= 0n) {
                        collateralPlusPnl = BigInt(pos.collateral) + pnlUsdc;
                    } else {
                        if (pnlUsdc >= BigInt(pos.collateral)) {
                            collateralPlusPnl = 0n;
                        } else {
                            collateralPlusPnl = BigInt(pos.collateral) - pnlUsdc;
                        }
                    }

                    if (collateralPlusPnl < mmUsdc) {
                        console.log(`Liquidation Triggered for ID ${i}!`);
                        console.log(`Collateral+PnL: ${ethers.formatUnits(collateralPlusPnl, 6)} < MM: ${ethers.formatUnits(mmUsdc, 6)}`);

                        if (!DRY_RUN) {
                            const tx = await pm.liquidate(MARKET_ADDRESS, i);
                            console.log(`Liquidation Tx Sent: ${tx.hash}`);
                            await tx.wait();
                            console.log(`Liquidation Confirmed for ID ${i}`);
                        } else {
                            console.log(`[DRY RUN] Would liquidate position ${i}`);
                        }
                    }

                } catch (e) {
                    console.error(`Error processing position ${i}:`, e);
                }

                // Rate limit protection
                await new Promise(r => setTimeout(r, 2000)); // 2s delay between positions
            }

        } catch (e) {
            console.error("Error in loop:", e);
        }

        await new Promise(r => setTimeout(r, 10000)); // Sleep 10s
    }
}

run();
