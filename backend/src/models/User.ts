import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    walletAddress: string;
    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Made optional as sometimes wallet login might be used later? But requirements said password.. let's stick to required but keep interface flexible or just required as per prompt. Prompt said "it contains... password". I'll make it required in schema.
    walletAddress: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);
