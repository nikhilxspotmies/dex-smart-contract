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
    // Optional at creation (a wallet can sign in before onboarding runs), but unique
    // once set — see the index below. `trim` matters: " bob" and "bob" must collide.
    UserName: { type: String, required: false, trim: true },
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

/**
 * Usernames are unique case-insensitively (collation strength 2), so "Trader1" and
 * "trader1" cannot both exist.
 *
 * Partial rather than sparse: a sparse unique index still indexes documents holding an
 * explicit `null`, so a second null would collide. Restricting to actual strings means
 * any number of accounts can sit in onboarding without a username yet.
 *
 * NOTE: Mongoose creates missing indexes but never alters an existing one. If a plain
 * `UserName_1` already exists on a deployment, it must be dropped by hand before this
 * definition takes effect.
 */
UserSchema.index(
    { UserName: 1 },
    {
        name: 'UserName_1',
        unique: true,
        partialFilterExpression: { UserName: { $type: 'string' } },
        collation: { locale: 'en', strength: 2 },
    }
);

export default mongoose.model<IUser>('User', UserSchema);
