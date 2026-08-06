import mongoose, { Schema, Document, Types } from 'mongoose';

// Rotating refresh token. Only the SHA-256 hash of the raw token is stored (never the raw value).
// One "family" = one login session that survives rotations; reuse of a spent token revokes the family.
export interface IRefreshToken extends Document {
    tokenHash: string;
    userId: Types.ObjectId;
    familyId: string;
    familyCreatedAt: Date;   // copied across rotations → enforces the absolute cap
    expiresAt: Date;         // TTL index auto-removes expired rows
    usedAt?: Date;           // set when this token is rotated out
    replacedBy?: Types.ObjectId; // the token that replaced this one (grace-window lookup)
    revokedAt?: Date;        // logout / reuse-detection
    createdAt: Date;
}

const RefreshTokenSchema: Schema = new Schema({
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    familyCreatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, required: false },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken', required: false },
    revokedAt: { type: Date, required: false },
    createdAt: { type: Date, default: Date.now },
});

// TTL index: auto-remove once expired (grace/reuse logic only needs rows until expiry).
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
