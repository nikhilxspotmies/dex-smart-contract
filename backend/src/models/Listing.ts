
import mongoose, { Schema, Document } from 'mongoose';

export interface IListing extends Document {
    listingId: number;
    seller: string;
    token: string;
    totalAmount: number;
    remaining: number;
    pricePerToken: number;
    active: boolean;
    createdAt: Date;
}

const ListingSchema: Schema = new Schema({
    listingId: { type: Number, required: true, unique: true },
    seller: { type: String, required: true },
    token: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    remaining: { type: Number, required: true },
    pricePerToken: { type: Number, required: true }, // stored as human readable number (e.g. 1.5 USDC)
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Index for fast sorting/filtering
ListingSchema.index({ active: 1, pricePerToken: 1 });
ListingSchema.index({ seller: 1 });

export default mongoose.model<IListing>('Listing', ListingSchema);
