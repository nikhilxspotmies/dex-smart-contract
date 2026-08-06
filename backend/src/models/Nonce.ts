import mongoose, { Schema, Document } from 'mongoose';

// F-07: short-lived single-use SIWE nonce, one per address.
export interface INonce extends Document {
    address: string;
    nonce: string;
    expiresAt: Date;
}

const NonceSchema: Schema = new Schema({
    address: { type: String, required: true, unique: true, lowercase: true, index: true },
    nonce: { type: String, required: true },
    expiresAt: { type: Date, required: true },
});

// TTL index: auto-remove once expired
NonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<INonce>('Nonce', NonceSchema);
