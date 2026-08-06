import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    UserName: string;

    email?: string;
    firstName: string;
    lastName: string;

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
    /**
     * The exact externalUserId Sumsub knows this user by.
     *
     * Applicants created before addresses were normalised live under a CHECKSUM-cased
     * address, so it can't be derived from `walletAddress` (now always lowercase).
     * Resolved once, then reused — without it, a legacy applicant is invisible and
     * Sumsub would silently open a fresh one, forcing a verified user to redo KYC.
     */
    sumsubExternalId?: string;
    kycRejectionReasons?: string[];
    kycComment?: string;
    kycIsFinal?: boolean;
}

const UserSchema: Schema = new Schema({
    UserName: { type: String, required: false },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },

    // Wallet-only auth: the address IS the identity. Email is profile data, collected
    // when a feature needs it — sparse so wallets without one can still have accounts,
    // and so two wallets sharing a social email don't collide on the unique index.
    email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
    // lowercase: checksum-cased addresses (MetaMask) must resolve to the same account.
    walletAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    createdAt: { type: Date, default: Date.now },

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String, required: false }, // Stores the walletAddress of the referrer
    referralPoints: { type: Number, default: 0 },
    hasDoneFirstTrade: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, required: false },
    kycStatus: { type: String, enum: ['NONE', 'INCOMPLETE', 'PENDING', 'VERIFIED', 'REJECTED'], default: 'NONE' },
    sumsubId: { type: String, required: false },
    sumsubExternalId: { type: String, required: false },
    kycRejectionReasons: { type: [String], default: [] },
    kycComment: { type: String, required: false },
    kycIsFinal: { type: Boolean, default: false }

});

export default mongoose.model<IUser>('User', UserSchema);
