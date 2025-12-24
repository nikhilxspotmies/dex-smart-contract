import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    UserName: string;

    email: string;
    firstName: string;
    lastName: string;

    walletAddress: string;
    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    UserName: { type: String, required: false },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },

    email: { type: String, required: true, unique: true },
    walletAddress: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);
