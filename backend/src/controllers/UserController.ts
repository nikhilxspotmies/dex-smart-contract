import type { Request, Response } from 'express';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

export const register = async (req: Request, res: Response) => {
    console.log("Registering user...");
    try {
        const { UserName, email, walletAddress } = req.body;

        if (!email || !walletAddress) {
            res.status(400).json({ message: 'Email and Wallet Address are required' });
            return;
        }

        const existingUser = await User.findOne({ $or: [{ walletAddress }, { email }] });
        if (existingUser) {
            res.status(400).json({ message: 'User with this wallet address or email already exists' });
            return;
        }

        const newUser = new User({
            UserName,
            email,
            walletAddress
        });

        await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                UserName: newUser.UserName,
                email: newUser.email,
                walletAddress: newUser.walletAddress
            },
            token: generateToken(newUser._id.toString())
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }

    console.log("User registered successfully");
};

export const login = async (req: Request, res: Response) => {
    try {
        const { walletAddress, email } = req.body;

        // 1. Wallet Login Flow (Primary)
        if (walletAddress) {
            const user = await User.findOne({ walletAddress });
            if (!user) {
                res.status(404).json({ message: 'User not found. Please sign up first.' });
                return;
            }

            res.status(200).json({
                message: 'Login successful',
                user: {
                    UserName: user.UserName,
                    email: user.email,
                    walletAddress: user.walletAddress
                },
                token: generateToken(user._id.toString())
            });
            return;
        }

        // 2. Email-based lookup (Optional fallback if needed, but insecure without password/OTP)
        // For now, restricting strict login to wallet address presence as it is the secure key.

        res.status(400).json({ message: 'Wallet Address required for login' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUserProfile = async (req: any, res: Response) => {
    const user = req.user;
    if (user) {
        res.json({
            UserName: user.UserName,
            email: user.email,
            walletAddress: user.walletAddress
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};
