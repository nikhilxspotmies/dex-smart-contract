import mongoose, { Schema, Document } from 'mongoose';

export enum TradeType {
    LONG = 'LONG',
    SHORT = 'SHORT'
}

export enum TradeStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
    LIQUIDATED = 'LIQUIDATED'
}

export interface IPerpTrade extends Document {
    walletAddress: string;
    positionId: string; // Unique ID from contract
    type: TradeType; // LONG or SHORT
    tokenSymbol: string;

    // Core Position Data
    size: string; // USD Notionals (was amount)
    collateral: string; // USDC Margin
    entryPrice: string;
    market: string; // Market contract address

    // Outcome Data
    exitPrice?: string;
    pnl?: string;
    closedSize?: string; // Size at the time of closing
    closedCollateral?: string; // Collateral at the time of closing

    // Metadata
    status: TradeStatus;
    openTxHash: string;
    closeTxHash?: string;
    timestamp: Date;
    closedAt?: Date;
    lastUpdatedBlock?: number; // For synchronization
}

const PerpTradeSchema: Schema = new Schema({
    walletAddress: { type: String, required: true, index: true },
    positionId: { type: String, required: true }, // Unique index defined below
    type: { type: String, enum: Object.values(TradeType), required: true },
    tokenSymbol: { type: String, required: true },

    size: { type: String, required: true }, // 1e18
    collateral: { type: String, required: true }, // 6d
    entryPrice: { type: String, required: true }, // 1e18
    market: { type: String, required: true }, // Address

    exitPrice: { type: String },
    pnl: { type: String },
    closedSize: { type: String },
    closedCollateral: { type: String },

    status: { type: String, enum: Object.values(TradeStatus), default: TradeStatus.OPEN },

    openTxHash: { type: String, required: true },
    closeTxHash: { type: String },

    timestamp: { type: Date, default: Date.now },
    closedAt: { type: Date },
    lastUpdatedBlock: { type: Number }
});

// Compound index for finding specific open positions
PerpTradeSchema.index({ walletAddress: 1, positionId: 1, status: 1 });
// positionId is already indexed by unique: true in the field definition? 
// No, the field definition had index: true. We should keep the unique index here and remove index: true from field.
PerpTradeSchema.index({ positionId: 1 }, { unique: true });

export default mongoose.model<IPerpTrade>('PerpTrade', PerpTradeSchema);
