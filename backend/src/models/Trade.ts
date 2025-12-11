import mongoose, { Schema, Document } from 'mongoose';

export interface ITrade extends Document {
    purchaseId: number;
    listingId: number;
    buyer: string;
    seller: string;
    quantity: number;
    pricePerToken: number;
    status: string;
    createdAt: Date;
}

const TradeSchema: Schema = new Schema({
    purchaseId: { type: Number, required: true, unique: true },
    listingId: { type: Number, required: true },
    buyer: { type: String, required: true },
    seller: { type: String, required: true },
    quantity: { type: Number, required: true },
    pricePerToken: { type: Number, required: true },
    status: { type: String, default: 'Proposed' }, // Proposed, Locked, Released, Refunded, Cancelled, Disputed
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<ITrade>('Trade', TradeSchema);
