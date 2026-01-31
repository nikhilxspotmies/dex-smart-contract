import mongoose, { Document, Schema } from 'mongoose';

export interface ICandle extends Document {
    symbol: string;
    timeframe: string; // '1m', '5m', '15m', '1h', '4h', '1d'
    open: number;
    high: number;
    low: number;
    close: number;
    time: number; // Unix timestamp in seconds
}

const candleSchema: Schema = new Schema({
    symbol: { type: String, required: true, index: true },
    timeframe: { type: String, required: true, index: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    time: { type: Number, required: true, index: true },
});

// Compound index for efficient querying
candleSchema.index({ symbol: 1, timeframe: 1, time: 1 }, { unique: true });

export default mongoose.model<ICandle>('Candle', candleSchema);
