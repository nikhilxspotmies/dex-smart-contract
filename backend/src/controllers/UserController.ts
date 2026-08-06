import type { Request, Response } from 'express';
import crypto from 'crypto';
import { SiweMessage, generateNonce } from 'siwe';
import User from '../models/User.js';
import Nonce from '../models/Nonce.js';
import RefreshToken from '../models/RefreshToken.js';
import signAccessToken from '../utils/generateToken.js';
import {
    setAccessCookie,
    setRefreshCookie,
    setCsrfCookie,
    clearAuthCookies,
    REFRESH_COOKIE,
} from '../utils/authCookie.js';
import { hashToken, issueRefreshToken, revokeFamily, revokeAllForUser } from '../utils/refreshToken.js';
import { issueCsrfToken } from '../utils/csrf.js';
import { env } from '../config/env.js';
import PerpTrade, { TradeStatus } from '../models/PerpTrade.js';
import Trade from '../models/Trade.js';
import Listing from '../models/Listing.js';
import { normalizeAddress } from '../utils/addressUtils.js';

// Start a session: issue a new family + access/refresh/csrf cookies. Used by authenticate.
const startSession = async (res: Response, userId: string): Promise<void> => {
    const familyId = crypto.randomUUID();
    const familyCreatedAt = new Date();
    setAccessCookie(res, signAccessToken(userId, familyId));
    const { raw } = await issueRefreshToken(userId, familyId, familyCreatedAt);
    setRefreshCookie(res, raw);
    setCsrfCookie(res, issueCsrfToken(familyId));
};

// F-07: issue a one-time SIWE nonce for a wallet address
export const getNonce = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            res.status(400).json({ message: 'walletAddress is required' });
            return;
        }

        const address = String(walletAddress).toLowerCase();
        const nonce = generateNonce();
        const expiresAt = new Date(Date.now() + env.NONCE_TTL_MS);

        await Nonce.findOneAndUpdate(
            { address },
            { address, nonce, expiresAt },
            { upsert: true, returnDocument: "after" }
        );

        res.status(200).json({ nonce });
    } catch (error) {
        console.error('getNonce error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// F-07: verify SIWE signature + nonce + domain + recovered address; consumes nonce on success
const verifyWalletOwnership = async (
    walletAddress: string,
    message?: string,
    signature?: string
): Promise<boolean> => {
    if (!walletAddress || !message || !signature) return false;

    const address = String(walletAddress).toLowerCase();
    const stored = await Nonce.findOne({ address });
    if (!stored || stored.expiresAt.getTime() < Date.now()) return false;

    let siwe: SiweMessage;
    try {
        siwe = new SiweMessage(message);
    } catch {
        return false;
    }

    // anti-phishing: domain must be one of ours
    if (!env.ALLOWED_SIWE_DOMAINS.includes(siwe.domain)) return false;

    let result;
    try {
        result = await siwe.verify(
            { signature, nonce: stored.nonce, domain: siwe.domain },
            { suppressExceptions: true }
        );
    } catch {
        return false;
    }

    if (!result.success) return false;
    if (result.data.address.toLowerCase() !== address) return false;

    // one-time use: consume nonce (replay protection)
    await Nonce.deleteOne({ _id: stored._id });
    return true;
};

// Unique 6-char referral code (retries on the rare collision).
const generateReferralCode = async (): Promise<string> => {
    for (;;) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!(await User.findOne({ referralCode: code }))) return code;
    }
};

/**
 * "Complete" means: we have a way to contact them.
 *
 * Deliberately NOT about the name — the legal name comes from KYC, where it's read off
 * a government document, so asking the user to type it would only create a mismatch to
 * reconcile later. Email is the one thing KYC can't be relied on to supply (verified
 * Sumsub applicants can have no email at all), so it's the one thing we ask for.
 */
const isProfileComplete = (user: any): boolean => Boolean(user.email);

const publicUser = (user: any) => ({
    UserName: user.UserName,
    email: user.email,
    walletAddress: user.walletAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    referralCode: user.referralCode,
    referralPoints: user.referralPoints || 0,
    kycStatus: user.kycStatus || 'NONE',
    profileComplete: isProfileComplete(user),
});

/**
 * Wallet-only authentication — the single door into the app.
 *
 * The wallet address IS the identity, so there is no separate signup: a SIWE-verified
 * wallet we've never seen gets a minimal account created on the spot (find-or-create),
 * and a wallet we know is simply logged back into its existing account with all its
 * history. Either way the caller signs exactly once and lands in the same place.
 *
 * Profile fields (email/name/username) are optional here and only used to seed a NEW
 * account; they are never trusted to identify an existing one.
 */
export const authenticate = async (req: Request, res: Response) => {
    try {
        const { walletAddress, message, signature, UserName, firstName, lastName, referralCode } = req.body;

        const address = normalizeAddress(walletAddress);
        if (!address) {
            res.status(400).json({ message: 'A valid walletAddress is required' });
            return;
        }

        const ownsWallet = await verifyWalletOwnership(address, message, signature);
        if (!ownsWallet) {
            res.status(401).json({ message: 'Wallet ownership verification failed' });
            return;
        }

        // ── Existing wallet → log in ────────────────────────────────────────────
        const existing = await User.findOne({ walletAddress: address });
        if (existing) {
            if (existing.isDeleted) {
                res.status(403).json({ message: 'This account has been deleted.' });
                return;
            }

            await startSession(res, existing._id.toString());
            res.status(200).json({ message: 'Login successful', created: false, user: publicUser(existing) });
            return;
        }

        // ── New wallet → create a minimal account, then log in ──────────────────
        // Email is best-effort profile data (thirdweb gives us one for social logins).
        // If another wallet already claims it, drop it rather than block the signup —
        // the same person may hold both an in-app wallet and MetaMask.
        let email: string | undefined = typeof req.body.email === 'string'
            ? req.body.email.trim().toLowerCase()
            : undefined;
        if (email && (await User.findOne({ email }))) email = undefined;

        const referrer = referralCode ? await User.findOne({ referralCode }) : null;

        const newUser = new User({
            walletAddress: address,
            email: email || undefined,
            UserName,
            firstName,
            lastName,
            referralCode: await generateReferralCode(),
            referredBy: referrer ? referrer.walletAddress : null,
            referralPoints: 0,
        });

        await newUser.save();
        await startSession(res, newUser._id.toString());

        res.status(201).json({ message: 'Account created', created: true, user: publicUser(newUser) });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUserProfile = async (req: any, res: Response) => {
    const user = req.user;
    if (user) {
        // Generate referral code for existing users if missing
        if (!user.referralCode) {
            let newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            let codeExists = await User.findOne({ referralCode: newReferralCode });
            while (codeExists) {
                newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                codeExists = await User.findOne({ referralCode: newReferralCode });
            }
            user.referralCode = newReferralCode;
            await user.save();
        }

        res.json({
            UserName: user.UserName,
            email: user.email,
            walletAddress: user.walletAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            referralCode: user.referralCode,
            referralPoints: user.referralPoints || 0,
            referredBy: user.referredBy || null,
            hasDoneFirstTrade: user.hasDoneFirstTrade || false,
            kycStatus: user.kycStatus || 'NONE',
            kycRejectionReasons: user.kycRejectionReasons || [],
            kycComment: user.kycComment || '',
            kycIsFinal: user.kycIsFinal || false,
            // drives the one-time "add your email" prompt and the profile form's locking
            profileComplete: isProfileComplete(user),
            nameLocked: user.kycStatus === 'VERIFIED'
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// Deliberately permissive: real addresses are validated by delivery, not by regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const updateUserProfile = async (req: any, res: Response) => {
    const user = req.user;
    if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
    }

    try {
        const { UserName, firstName, lastName, email } = req.body;

        // Once KYC has passed, the name on file is the one Sumsub read off a government
        // document. Letting it be edited afterwards would leave our records disagreeing
        // with the verified identity, so it's frozen until re-verification.
        const nameIsLocked = user.kycStatus === 'VERIFIED';
        const wantsNameChange =
            (firstName !== undefined && firstName !== user.firstName) ||
            (lastName !== undefined && lastName !== user.lastName);

        if (nameIsLocked && wantsNameChange) {
            res.status(403).json({
                message: 'Your name is verified by KYC and can no longer be changed.',
                code: 'NAME_LOCKED_BY_KYC',
            });
            return;
        }

        if (email !== undefined) {
            const next = String(email).trim().toLowerCase();
            if (!EMAIL_RE.test(next)) {
                res.status(400).json({ message: 'Please enter a valid email address.' });
                return;
            }
            if (next !== user.email) {
                // email is unique+sparse; check first so we can answer clearly instead of
                // surfacing a duplicate-key error.
                const taken = await User.findOne({ email: next, _id: { $ne: user._id } });
                if (taken) {
                    res.status(409).json({
                        message: 'That email is already linked to another account.',
                        code: 'EMAIL_TAKEN',
                    });
                    return;
                }
                user.email = next;
            }
        }

        if (UserName !== undefined) user.UserName = UserName;
        if (!nameIsLocked) {
            if (firstName !== undefined) user.firstName = firstName;
            if (lastName !== undefined) user.lastName = lastName;
        }

        const updatedUser = await user.save();

        // refresh the access cookie in-place, keeping the same session family (fid)
        if (req.familyId) {
            setAccessCookie(res, signAccessToken(updatedUser._id.toString(), req.familyId));
        }

        res.json({
            UserName: updatedUser.UserName,
            email: updatedUser.email,
            walletAddress: updatedUser.walletAddress,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            kycStatus: updatedUser.kycStatus || 'NONE',
            nameLocked: updatedUser.kycStatus === 'VERIFIED',
            profileComplete: isProfileComplete(updatedUser),
        });
    } catch (error) {
        console.error('updateUserProfile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Rotate the session: exchange a valid refresh token for a fresh access token (+ rotated refresh).
 * Public route (the refresh cookie IS the credential) but CSRF-checked.
 * Implements atomic single-spend + grace window + reuse detection.
 */
export const refresh = async (req: Request, res: Response) => {
    try {
        const raw = req.cookies?.[REFRESH_COOKIE];
        if (!raw) {
            res.status(401).json({ message: 'no_refresh' });
            return;
        }

        const tokenHash = hashToken(raw);
        const row = await RefreshToken.findOne({ tokenHash });
        if (!row) {
            res.status(401).json({ message: 'unknown' });
            return;
        }

        const now = Date.now();
        if (row.revokedAt) {
            res.status(401).json({ message: 'revoked' });
            return;
        }
        if (row.expiresAt.getTime() < now) {
            res.status(401).json({ message: 'expired' });
            return;
        }
        if (now - row.familyCreatedAt.getTime() > env.REFRESH_ABSOLUTE_TTL_MS) {
            await revokeFamily(row.familyId);
            clearAuthCookies(res);
            res.status(401).json({ message: 'absolute_cap' });
            return;
        }

        // ── ATOMIC SPEND: only one caller (across all pods) can flip usedAt. ──
        const won = await RefreshToken.findOneAndUpdate(
            { tokenHash, usedAt: { $exists: false } },
            { $set: { usedAt: new Date() } },
            { new: false }
        );

        if (won) {
            // winner → rotate exactly once
            const { raw: childRaw, doc: child } = await issueRefreshToken(
                row.userId,
                row.familyId,
                row.familyCreatedAt
            );
            await RefreshToken.updateOne({ _id: row._id }, { $set: { replacedBy: child._id } });
            setRefreshCookie(res, childRaw);
            setAccessCookie(res, signAccessToken(row.userId.toString(), row.familyId));
            setCsrfCookie(res, issueCsrfToken(row.familyId));
            res.status(200).json({ ok: true });
            return;
        }

        // lost the CAS, or a genuine replay — re-read to inspect
        const cur = await RefreshToken.findOne({ tokenHash });
        // Grace is purely TIME-based: if the token was spent < GRACE ago it's a benign
        // concurrent refresh (multi-tab / retry / lost-CAS race). Do NOT also require
        // `replacedBy` — the winner may not have written it yet, and gating on it caused
        // false reuse-revocation under concurrency. Only spend that is OLD is real reuse.
        if (cur?.usedAt && now - cur.usedAt.getTime() < env.REFRESH_GRACE_MS) {
            // winner already set the child cookie in the shared jar; just mint a fresh access token.
            setAccessCookie(res, signAccessToken(cur.userId.toString(), cur.familyId));
            res.status(200).json({ ok: true });
            return;
        }

        // outside grace / no valid child → real reuse or theft → kill the whole family
        const fid = cur?.familyId ?? row.familyId;
        await revokeFamily(fid);
        clearAuthCookies(res);
        console.warn('SECURITY refresh_reuse_detected', {
            userId: (cur?.userId ?? row.userId)?.toString(),
            familyId: fid,
        });
        res.status(401).json({ message: 'reuse_detected' });
    } catch (error) {
        console.error('refresh error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// F-06: clear the session + revoke this family server-side (best-effort; works even if access expired)
export const logout = async (req: Request, res: Response) => {
    try {
        const raw = req.cookies?.[REFRESH_COOKIE];
        if (raw) {
            const row = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
            if (row) await revokeFamily(row.familyId);
        }
    } catch (error) {
        console.error('logout error:', error);
    }
    clearAuthCookies(res);
    res.status(200).json({ message: 'Logged out' });
};

// Revoke every session for the authenticated user (logout everywhere).
export const logoutAll = async (req: any, res: Response) => {
    try {
        if (req.user?._id) await revokeAllForUser(req.user._id);
    } catch (error) {
        console.error('logoutAll error:', error);
    }
    clearAuthCookies(res);
    res.status(200).json({ message: 'Logged out of all sessions' });
};

/**
 * Process first trade referral reward.
 * Called by external microservices (Limit Order, Copy Trading) after a trade is executed.
 */
export const processFirstTrade = async (req: Request, res: Response) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            res.status(400).json({ message: 'walletAddress is required' });
            return;
        }

        // H1/M4: validate address format before use in any query
        const addr = normalizeAddress(walletAddress);
        if (!addr) {
            res.status(400).json({ message: 'Invalid wallet address' });
            return;
        }

        // M4: atomic "set hasDoneFirstTrade true only if it was false" — prevents race-condition
        // double-reward if this endpoint is called concurrently for the same user.
        const prevUser = await User.findOneAndUpdate(
            { walletAddress: { $regex: `^${addr}$`, $options: 'i' }, hasDoneFirstTrade: { $ne: true } },
            { $set: { hasDoneFirstTrade: true } },
            { new: false }
        );

        if (!prevUser) {
            const exists = await User.exists({ walletAddress: { $regex: `^${addr}$`, $options: 'i' } });
            if (!exists) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            res.status(200).json({ message: 'User has already completed first trade', rewarded: false });
            return;
        }

        // Award referral points atomically (avoids read-modify-write race on referralPoints)
        if (prevUser.referredBy) {
            const refAddr = normalizeAddress(prevUser.referredBy);
            if (refAddr) {
                await User.updateOne(
                    { walletAddress: { $regex: `^${refAddr}$`, $options: 'i' } },
                    { $inc: { referralPoints: 100 } }
                );
                console.log(`Referral Reward (External): received 100 points for referring ${addr}`);
            }
        }

        res.status(200).json({ message: 'First trade processed, referral rewarded', rewarded: true });
    } catch (error) {
        console.error('processFirstTrade error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Delete (soft-delete) a user account.
 * Protected route — requires JWT auth.
 *
 * Pre-flight checks:
 * - Blocks deletion if user has OPEN perpetual positions
 * - Blocks deletion if user has active P2P trades (Proposed/Locked)
 * - Blocks deletion if user has active P2P listings
 *
 * On success:
 * - Sets isDeleted = true and deletedAt = now on the User document
 * - All trade history, swap history, etc. remains intact
 * - Referral chain is preserved (referredBy pointers stay)
 * - Referral code stops working for new signups (login guard rejects deleted users)
 */
export const deleteAccount = async (req: any, res: Response) => {
    try {
        const user = req.user;

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.isDeleted) {
            res.status(400).json({ message: 'Account is already deleted' });
            return;
        }

        const walletAddress = user.walletAddress;
        // H1: normalize address from session before use in queries
        const walletAddr = normalizeAddress(walletAddress);
        if (!walletAddr) {
            res.status(400).json({ message: 'Invalid wallet address in session' });
            return;
        }

        // --- Pre-flight checks ---

        // 1. Check for OPEN perpetual positions
        const openPerpPositions = await PerpTrade.countDocuments({
            walletAddress: { $regex: `^${walletAddr}$`, $options: 'i' },
            status: TradeStatus.OPEN
        });

        if (openPerpPositions > 0) {
            res.status(400).json({
                message: `Cannot delete account: you have ${openPerpPositions} open perpetual position(s). Please close them first.`
            });
            return;
        }

        // 2. Check for active P2P trades (Proposed or Locked)
        const activeP2PTrades = await Trade.countDocuments({
            $or: [
                { buyer: { $regex: `^${walletAddr}$`, $options: 'i' } },
                { seller: { $regex: `^${walletAddr}$`, $options: 'i' } }
            ],
            status: { $in: ['Proposed', 'Locked'] }
        });

        if (activeP2PTrades > 0) {
            res.status(400).json({
                message: `Cannot delete account: you have ${activeP2PTrades} active P2P trade(s). Please complete or cancel them first.`
            });
            return;
        }

        // 3. Check for active listings
        const activeListings = await Listing.countDocuments({
            seller: { $regex: `^${walletAddr}$`, $options: 'i' },
            active: true
        });

        if (activeListings > 0) {
            res.status(400).json({
                message: `Cannot delete account: you have ${activeListings} active listing(s). Please delist them first.`
            });
            return;
        }

        // --- All checks passed, soft-delete the account ---
        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save();

        console.log(`Account soft-deleted: ${walletAddr} at ${user.deletedAt.toISOString()}`);

        // F-06: revoke all sessions + clear cookies
        await revokeAllForUser(user._id);
        clearAuthCookies(res);

        res.status(200).json({
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
