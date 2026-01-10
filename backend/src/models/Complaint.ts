import mongoose, { Schema, Document } from 'mongoose';

export interface IComplaint extends Document {
    purchaseId: number;
    reporter: string;
    reason: string;
    createdAt: Date;
}

const ComplaintSchema: Schema = new Schema({
    purchaseId: { type: Number, required: true },
    reporter: { type: String, required: true },
    reason: { type: String, default: 'Payment not received' },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IComplaint>('Complaint', ComplaintSchema);
