import mongoose, { Schema, Document } from 'mongoose';

export interface IWhaleSnapshot extends Document {
    whaleAddress: string;
    valueUsd: number;
    timestamp: Date;
}

const WhaleSnapshotSchema: Schema = new Schema({
    whaleAddress: { type: String, required: true, lowercase: true, index: true },
    valueUsd: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IWhaleSnapshot>('WhaleSnapshot', WhaleSnapshotSchema);
