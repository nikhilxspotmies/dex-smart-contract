import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    UserName: string;

    email: string;
    firstName: string;
    lastName: string;
    password?: string;

    walletAddress: string;
    createdAt: Date;
    referralCode?: string;
    referredBy?: string;
    referralPoints?: number;
    hasDoneFirstTrade?: boolean;
    isDeleted?: boolean;
    deletedAt?: Date;
    kycStatus?: 'NONE' | 'INCOMPLETE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    sumsubId?: string;
    kycRejectionReasons?: string[];
    kycComment?: string;
    kycIsFinal?: boolean;
}

const UserSchema: Schema = new Schema({
    UserName: { type: String, required: false },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    password: { type: String, required: false },

    email: { type: String, required: true, unique: true },
    walletAddress: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String, required: false }, // Stores the walletAddress of the referrer
    referralPoints: { type: Number, default: 0 },
    hasDoneFirstTrade: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false },
    kycStatus: { type: String, enum: ['NONE', 'INCOMPLETE', 'PENDING', 'VERIFIED', 'REJECTED'], default: 'NONE' },
    sumsubId: { type: String, required: false },
    kycRejectionReasons: { type: [String], default: [] },
    kycComment: { type: String, required: false },
    kycIsFinal: { type: Boolean, default: false }

});

export default mongoose.model<IUser>('User', UserSchema);
