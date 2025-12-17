
import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
    purchaseId: number;
    sender: string; // Wallet Address
    message: string;
    timestamp: Date;
}

const ChatMessageSchema: Schema = new Schema({
    purchaseId: { type: Number, required: true, index: true },
    sender: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
