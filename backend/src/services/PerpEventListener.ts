
import { prepareEvent, getContractEvents } from "thirdweb";
import { client, chain } from "../utils/client.js";
import { getContract } from "thirdweb";
import PerpTrade, { TradeStatus } from "../models/PerpTrade.js";
import { config } from "dotenv";

config();

const MARKET_ADDRESS = process.env.VITE_PERP_MARKET_ADDRESS || "";

if (!MARKET_ADDRESS) {
    console.error("Missing VITE_PERP_MARKET_ADDRESS in .env");
}

const contract = getContract({
    client,
    chain,
    address: MARKET_ADDRESS,
});

// Event Signatures (mapped to Thirdweb)
// We need the ABI or the signature to prepare events.
// Since we don't have the full ABI JSON import handy here as a const, 
// we will use the prepareEvent with the signature string if possible, 
// or simpler: poll for events using the standard method.

// Assuming standard event signatures based on Market.sol analysis:
// event PositionIncreased(uint256 indexed positionId, address indexed account, string symbol, uint256 collateralDelta, uint256 sizeDelta, uint256 price, uint8 side);
// event PositionDecreased(uint256 indexed positionId, address indexed account, uint256 collateralDelta, uint256 sizeDelta, uint256 price, int256 pnl);
// event PositionLiquidated(uint256 indexed positionId, address indexed account, address liquidator, uint256 remainingCollateral);

// Note: We need to match the actual ABI. 
// For now, I will implement a polling mechanism or use watchContractEvents if available in the version of thirdweb used.

const POLL_INTERVAL = 5000; // 5 seconds

export class PerpEventListener {
    private isRunning: boolean = false;
    private lastBlock: bigint = 0n;

    constructor() {
        console.log("PerpEventListener initialized for Market:", MARKET_ADDRESS);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.poll();
    }

    private async poll() {
        if (!this.isRunning) return;

        try {
            // In a real production setup, we should persist lastBlock to DB to survive restarts.
            // For now, we'll start from "now" (latest block) on boot, or a configured start block.

            // TODO: Implement actual event fetching using thirdweb
            // const events = await getContractEvents({ ... })

            // Placeholder: Emulating loop
            // console.log("Polling for events...");

        } catch (error) {
            console.error("Error in event polling:", error);
        }

        setTimeout(() => this.poll(), POLL_INTERVAL);
    }
}

// Actual Implementation with Thirdweb 'watchContractEvents' if supported or polling
// Let's rely on the definition found in `BlockchainService.ts` imports: 
// import { watchContractEvents } from "thirdweb";

import { watchContractEvents } from "thirdweb";

export const startPerpEventListener = () => {
    console.log("Starting Perpetual Event Listener...");


    // 1. Position Increased
    // event PositionIncreased(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price);
    const positionIncreasedEvent = prepareEvent({
        signature: "event PositionIncreased(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price)"
    });

    const unwatchIncreased = watchContractEvents({
        contract,
        events: [positionIncreasedEvent],
        onEvents: async (events) => {
            for (const event of events) {
                console.log("PositionIncreased Event:", event.args);
                await handlePositionIncreased(event.args, event.transactionHash, event.blockNumber);
            }
        },
    });

    // 2. Position Decreased
    // event PositionDecreased(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl);
    const positionDecreasedEvent = prepareEvent({
        signature: "event PositionDecreased(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl)"
    });

    const unwatchDecreased = watchContractEvents({
        contract,
        events: [positionDecreasedEvent],
        onEvents: async (events) => {
            for (const event of events) {
                console.log("PositionDecreased Event:", event.args);
                await handlePositionDecreased(event.args, event.transactionHash, event.blockNumber);
            }
        },
    });

    // 3. Liquidated
    // event Liquidated(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl);
    const liquidatedEvent = prepareEvent({
        signature: "event Liquidated(address indexed user, uint256 indexed positionId, bool isLong, uint256 size, uint256 collateral, uint256 price, int256 pnl)"
    });

    const unwatchLiquidated = watchContractEvents({
        contract,
        events: [liquidatedEvent],
        onEvents: async (events) => {
            for (const event of events) {
                console.log("Liquidated Event:", event.args);
                await handleLiquidated(event.args, event.transactionHash, event.blockNumber);
            }
        },
    });

    return { unwatchIncreased, unwatchDecreased, unwatchLiquidated };
};

// Handlers

async function handlePositionIncreased(args: any, txHash: string, blockNumber: bigint) {
    /* 
      args: {
        user: string,
        positionId: bigint,
        isLong: boolean,
        size: bigint,
        collateral: bigint,
        price: bigint
      }
    */
    try {
        const { user, positionId, isLong, size, collateral, price } = args;

        // Find existing or create new
        // Since this is 'Increased', it could be a new position or adding to existing.
        // We use findOneAndUpdate with upsert: true

        // Check if it exists strictly
        let trade = await PerpTrade.findOne({ positionId: positionId.toString() });

        if (!trade) {
            // Create New
            trade = new PerpTrade({
                walletAddress: user,
                positionId: positionId.toString(),
                type: isLong ? 'LONG' : 'SHORT',
                tokenSymbol: "ETH", // TODO: Fetch from contract if multi-asset, currently Market implies baseSymbol
                size: size.toString(),
                collateral: collateral.toString(),
                entryPrice: price.toString(),
                market: MARKET_ADDRESS,
                status: TradeStatus.OPEN,
                openTxHash: txHash,
                lastUpdatedBlock: Number(blockNumber)
            });
            await trade.save();
            console.log(`[DB] Created new position ${positionId} for ${user}`);
        } else {
            // Update Existing
            console.log(`[DB Debug] Updating Pos ${positionId}: Old Size ${trade.size} -> New Size ${size}`);

            trade.size = size.toString();
            trade.collateral = collateral.toString();
            trade.entryPrice = price.toString();

            trade.lastUpdatedBlock = Number(blockNumber);
            const savedTrade = await trade.save();
            console.log(`[DB] Updated position ${positionId}. Saved Size: ${savedTrade.size}, Collateral: ${savedTrade.collateral}`);
        }
    } catch (err) {
        console.error("Error handling PositionIncreased:", err);
    }
}

async function handlePositionDecreased(args: any, txHash: string, blockNumber: bigint) {
    try {
        const { user, positionId, isLong, size, collateral, price, pnl } = args;

        // Market.sol emits the size/collateral being REDUCED, not the new total?
        // Code: `emit PositionDecreased(..., sizeDelta, p.collateral, ...)`
        // Wait, Market.sol line 272: `emit PositionDecreased(..., sizeDelta, p.collateral, ...);`
        // `sizeDelta` is the amount removed. 
        // `p.collateral` is the REMAINING collateral (because line 244 updates p.collateral before emit).

        // So `size` in event is DELTA. `collateral` in event is FINAL BALANCE.

        const trade = await PerpTrade.findOne({ positionId: positionId.toString() });
        if (!trade) return;

        const currentSize = BigInt(trade.size);
        const deltaSize = size; // args.size
        const newSize = currentSize - deltaSize;

        if (newSize <= 0n) {
            trade.status = TradeStatus.CLOSED;
            trade.closeTxHash = txHash;
            trade.closedAt = new Date();
            trade.size = "0";
            trade.collateral = "0"; // Collateral should be 0 if closed
        } else {
            trade.size = newSize.toString();
            trade.collateral = collateral.toString(); // This is the remaining collateral
        }

        if (pnl) {
            trade.pnl = pnl.toString();
        }


        trade.lastUpdatedBlock = Number(blockNumber);
        await trade.save();
        console.log(`[DB] Decreased/Closed position ${positionId}`);

    } catch (err) {
        console.error("Error handling PositionDecreased:", err);
    }
}

async function handleLiquidated(args: any, txHash: string, blockNumber: bigint) {
    try {
        console.log("Processing Liquidated Event for:", args);
        const { positionId, user, price, pnl } = args;

        const trade = await PerpTrade.findOne({ positionId: positionId.toString() });
        if (!trade) {
            console.log(`[DB] Trade ${positionId} not found in DB during processing Liquidated`);
            return;
        }

        trade.status = TradeStatus.LIQUIDATED;
        trade.closeTxHash = txHash;
        trade.closedAt = new Date();
        trade.exitPrice = price.toString();
        trade.size = "0";
        trade.collateral = "0";

        if (pnl) trade.pnl = pnl.toString();

        trade.lastUpdatedBlock = Number(blockNumber);
        await trade.save();
        console.log(`[DB] Liquidated position ${positionId} - Status Updated`);
    } catch (err) {
        console.error("Error handling Liquidated:", err);
    }
}
