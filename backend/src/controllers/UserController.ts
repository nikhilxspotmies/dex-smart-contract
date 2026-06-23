import type { Request, Response } from 'express';
import { SiweMessage, generateNonce } from 'siwe';
import User from '../models/User.js';
import Nonce from '../models/Nonce.js';
import generateToken from '../utils/generateToken.js';
import { setAuthCookie, clearAuthCookie } from '../utils/authCookie.js';
import { env } from '../config/env.js';
import bcrypt from 'bcrypt';
import PerpTrade, { TradeStatus } from '../models/PerpTrade.js';
import Trade from '../models/Trade.js';
import Listing from '../models/Listing.js';
import { normalizeAddress } from '../utils/addressUtils.js';

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
            { upsert: true, new: true }
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

export const register = async (req: Request, res: Response) => {
    console.log("Registering user...");
    try {
        const { UserName, email, walletAddress, firstName, lastName, password, referralCode } = req.body;

        if (!email || !walletAddress) {
            res.status(400).json({ message: 'Email and Wallet Address are required' });
            return;
        }

        // F-07: prove wallet ownership before creating the account
        const { message, signature } = req.body;
        const ownsWallet = await verifyWalletOwnership(walletAddress, message, signature);
        if (!ownsWallet) {
            res.status(401).json({ message: 'Wallet ownership verification failed' });
            return;
        }

        const existingUser = await User.findOne({ $or: [{ walletAddress }, { email }] });
        if (existingUser) {
            if (existingUser.isDeleted) {
                res.status(400).json({ message: 'This account was previously deleted. Please contact support.' });
                return;
            }
            res.status(400).json({ message: 'User with this wallet address or email already exists' });
            return;
        }

        let hashedPassword;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        // Generate Unique Referral Code
        let newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        let codeExists = await User.findOne({ referralCode: newReferralCode });
        while (codeExists) {
            newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            codeExists = await User.findOne({ referralCode: newReferralCode });
        }

        // Handle Referred By
        let referredByWallet = null;
        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                referredByWallet = referrer.walletAddress;
            }
        }

        const newUser = new User({
            UserName,
            email,
            walletAddress,
            firstName,
            lastName,
            password: hashedPassword,
            referralCode: newReferralCode,
            referredBy: referredByWallet,
            referralPoints: 0
        });

        await newUser.save();

        // F-06: JWT set as HttpOnly cookie (also in body for header clients)
        const token = generateToken(newUser._id.toString());
        setAuthCookie(res, token);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                UserName: newUser.UserName,
                email: newUser.email,
                walletAddress: newUser.walletAddress,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                referralCode: newUser.referralCode,
                referralPoints: newUser.referralPoints || 0
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

    console.log("User registered successfully");
};

export const login = async (req: Request, res: Response) => {
    try {
        const { walletAddress, email, password } = req.body;

        // 1. Wallet Login Flow (Primary)
        if (walletAddress) {
            // F-07: require a SIWE signature proving wallet control
            const { message, signature } = req.body;
            const ownsWallet = await verifyWalletOwnership(walletAddress, message, signature);
            if (!ownsWallet) {
                res.status(401).json({ message: 'Wallet ownership verification failed' });
                return;
            }

            const user = await User.findOne({ walletAddress });
            if (!user) {
                res.status(404).json({ message: 'User not found. Please sign up first.' });
                return;
            }

            if (user.isDeleted) {
                res.status(403).json({ message: 'This account has been deleted.' });
                return;
            }

            const token = generateToken(user._id.toString());
            setAuthCookie(res, token);

            res.status(200).json({
                message: 'Login successful',
                user: {
                    UserName: user.UserName,
                    email: user.email,
                    walletAddress: user.walletAddress,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    referralCode: user.referralCode,
                    referralPoints: user.referralPoints || 0
                }
            });
            return;
        }

        // 2. Email + Password Login Flow
        if (email && password) {
            const user = await User.findOne({ email });
            if (!user) {
                res.status(400).json({ message: 'Invalid email or password' });
                return;
            }

            if (user.isDeleted) {
                res.status(403).json({ message: 'This account has been deleted.' });
                return;
            }

            if (!user.password) {
                res.status(400).json({ message: 'This account was created with a wallet. Please login with wallet.' });
                return;
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                res.status(400).json({ message: 'Invalid email or password' });
                return;
            }

            const token = generateToken(user._id.toString());
            setAuthCookie(res, token);

            res.status(200).json({
                message: 'Login successful',
                user: {
                    UserName: user.UserName,
                    email: user.email,
                    walletAddress: user.walletAddress,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    referralCode: user.referralCode,
                    referralPoints: user.referralPoints || 0
                }
            });
            return;
        }

        res.status(400).json({ message: 'Wallet Address OR Email/Password required for login' });

    } catch (error) {
        console.error('Login error:', error);
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
            kycIsFinal: user.kycIsFinal || false
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export const updateUserProfile = async (req: any, res: Response) => {
    const user = req.user;

    if (user) {
        user.UserName = req.body.UserName || user.UserName;
        user.firstName = req.body.firstName || user.firstName;
        user.lastName = req.body.lastName || user.lastName;

        const updatedUser = await user.save();

        const token = generateToken(updatedUser._id.toString());
        setAuthCookie(res, token);

        res.json({
            UserName: updatedUser.UserName,
            email: updatedUser.email,
            walletAddress: updatedUser.walletAddress,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

// F-06: clear the session cookie
export const logout = async (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logged out' });
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

        // F-06: clear the session cookie
        clearAuthCookie(res);

        res.status(200).json({
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
