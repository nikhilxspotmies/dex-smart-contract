import crypto from 'crypto';
import { Types } from 'mongoose';
import RefreshToken, { type IRefreshToken } from '../models/RefreshToken.js';
import { env } from '../config/env.js';

// SHA-256 hex of a raw token. Deterministic → lets us look up by hash without storing the raw value.
export const hashToken = (raw: string): string =>
    crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Issue a new refresh token row and return the RAW value (only ever exposed here → set as cookie).
 * `familyId`/`familyCreatedAt` are passed on rotation to keep the session lineage intact.
 */
export const issueRefreshToken = async (
    userId: Types.ObjectId | string,
    familyId: string,
    familyCreatedAt: Date
): Promise<{ raw: string; doc: IRefreshToken }> => {
    const raw = crypto.randomBytes(32).toString('hex');
    const doc = await RefreshToken.create({
        tokenHash: hashToken(raw),
        userId,
        familyId,
        familyCreatedAt,
        expiresAt: new Date(Date.now() + env.REFRESH_IDLE_TTL_MS),
    });
    return { raw, doc };
};

// Revoke every token in a family (reuse-detection kill switch / single-session logout).
export const revokeFamily = async (familyId: string): Promise<void> => {
    await RefreshToken.updateMany(
        { familyId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
    );
};

// Revoke all sessions for a user (logout-all-devices / account delete).
export const revokeAllForUser = async (userId: Types.ObjectId | string): Promise<void> => {
    await RefreshToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
    );
};
