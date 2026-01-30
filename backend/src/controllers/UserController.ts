import type { Request, Response } from 'express';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT token
const generateToken = (userId: string, walletAddress?: string | null) => {
    return jwt.sign(
        { userId, walletAddress },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { address } = req.params;

        const user = await User.findOne({
            walletAddress: { $regex: new RegExp(`^${address}$`, 'i') }
        });

        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        res.status(200).json(user);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};



// Sign in with wallet address
export const signIn = async (req: Request, res: Response) => {
    try {
        const { walletAddress, email, password } = req.body;

        // Wallet-based login
        if (walletAddress) {
            let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

            if (!user) {
                // Auto-register wallet users
                user = new User({
                    walletAddress: walletAddress.toLowerCase(),
                    email: email?.toLowerCase()
                });
                await user.save();
            }

            // Update last login
            user.lastLoginAt = new Date();
            if (email && !user.email) {
                user.email = email.toLowerCase();
            }
            await user.save();

            const token = generateToken(user._id.toString(), user.walletAddress);

            return res.json({
                success: true,
                token,
                user: {
                    id: user._id,
                    walletAddress: user.walletAddress,
                    email: user.email,
                    username: user.username,
                    referralCode: user.referralCode,
                    referralPoints: user.referralPoints
                }
            });
        }

        // Email/Password login
        if (email && password) {
            const user = await User.findOne({ email: email.toLowerCase() });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found. Please sign up first.'
                });
            }

            if (!user.password) {
                return res.status(400).json({
                    success: false,
                    message: 'This account uses wallet login. Please use your wallet.'
                });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid password'
                });
            }

            user.lastLoginAt = new Date();
            await user.save();

            const token = generateToken(user._id.toString(), user.walletAddress);

            return res.json({
                success: true,
                token,
                user: {
                    id: user._id,
                    walletAddress: user.walletAddress,
                    email: user.email,
                    username: user.username,
                    referralCode: user.referralCode,
                    referralPoints: user.referralPoints
                }
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Please provide walletAddress or email/password'
        });

    } catch (error: any) {
        console.error('Sign in error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Sign up with email/password
export const signUp = async (req: Request, res: Response) => {
    try {
        const { email, password, walletAddress, username, referralCode, firstName, lastName } = req.body;

        // Check if user already exists
        if (email) {
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered'
                });
            }
        }

        if (walletAddress) {
            const existingWallet = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
            if (existingWallet) {
                return res.status(400).json({
                    success: false,
                    message: 'Wallet already registered'
                });
            }
        }

        // Hash password if provided
        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // Create user
        const user = new User({
            email: email?.toLowerCase(),
            password: hashedPassword,
            walletAddress: walletAddress?.toLowerCase(),
            username,
            firstName,
            lastName,
            referredBy: referralCode
        });

        await user.save();

        // If referred by someone, give them points
        if (referralCode) {
            await User.findOneAndUpdate(
                { referralCode },
                { $inc: { referralPoints: 10 } }
            );
        }

        const token = generateToken(user._id.toString(), user.walletAddress);

        return res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                walletAddress: user.walletAddress,
                email: user.email,
                username: user.username,
                referralCode: user.referralCode,
                referralPoints: user.referralPoints
            }
        });

    } catch (error: any) {
        console.error('Sign up error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

// Get current user
export const getUser = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            user: {
                id: user._id,
                walletAddress: user.walletAddress,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                referralCode: user.referralCode,
                referralPoints: user.referralPoints,
                referredBy: user.referredBy,
                createdAt: user.createdAt
            }
        });

    } catch (error: any) {
        console.error('Get user error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// Get user referral stats
export const getReferralStats = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Count referrals
        const referralCount = await User.countDocuments({ referredBy: user.referralCode });

        return res.json({
            success: true,
            referralCode: user.referralCode,
            referralPoints: user.referralPoints,
            referralCount
        });

    } catch (error: any) {
        console.error('Get referral stats error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};
