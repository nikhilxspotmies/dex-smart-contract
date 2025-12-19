import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

export const register = async (req: Request, res: Response) => {
    try {
        const { firstName, lastName, email, password, walletAddress } = req.body;

        if (!firstName || !lastName || !email || !password || !walletAddress) {
            res.status(400).json({ message: 'All fields are required' });
            return;
        }

        const existingUser = await User.findOne({ $or: [{ walletAddress }, { email }] });
        if (existingUser) {
            res.status(400).json({ message: 'User with this wallet address already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            walletAddress
        });

        await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                walletAddress: newUser.walletAddress
            },
            token: generateToken(newUser._id.toString())
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password, walletAddress } = req.body;

        // 1. Wallet Login Flow
        if (walletAddress) {
            const user = await User.findOne({ walletAddress });
            if (!user) {
                res.status(404).json({ message: 'User not found. Please sign up first.' });
                return;
            }

            res.status(200).json({
                message: 'Login successful',
                user: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    walletAddress: user.walletAddress
                },
                token: generateToken(user._id.toString())
            });
            return;
        }

        // 2. Email/Password Login Flow
        if (email && password) {
            const user = await User.findOne({ email });
            if (!user) {
                res.status(400).json({ message: 'Invalid email or password' });
                return;
            }

            if (!user.password) {
                res.status(400).json({ message: 'Invalid email or password' });
                return;
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                res.status(400).json({ message: 'Invalid email or password' });
                return;
            }

            res.status(200).json({
                message: 'Login successful',
                user: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    walletAddress: user.walletAddress
                },
                token: generateToken(user._id.toString())
            });
            return;
        }

        // 3. Fallback / Error
        res.status(400).json({ message: 'Email/Password or Wallet Address required for login' });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUserProfile = async (req: any, res: Response) => {
    const user = req.user;
    if (user) {
        res.json({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            walletAddress: user.walletAddress
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};
