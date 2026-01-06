import type { Request, Response } from 'express';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import bcrypt from 'bcrypt';

export const register = async (req: Request, res: Response) => {
    console.log("Registering user...");
    try {
        const { UserName, email, walletAddress, firstName, lastName, password } = req.body;

        if (!email || !walletAddress) {
            res.status(400).json({ message: 'Email and Wallet Address are required' });
            return;
        }

        const existingUser = await User.findOne({ $or: [{ walletAddress }, { email }] });
        if (existingUser) {
            res.status(400).json({ message: 'User with this wallet address or email already exists' });
            return;
        }

        let hashedPassword;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        const newUser = new User({
            UserName,
            email,
            walletAddress,
            firstName,
            lastName,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                UserName: newUser.UserName,
                email: newUser.email,
                walletAddress: newUser.walletAddress,
                firstName: newUser.firstName,
                lastName: newUser.lastName
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
        const { walletAddress, email, password } = req.body;

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
                    walletAddress: user.walletAddress,
                    firstName: user.firstName,
                    lastName: user.lastName
                },
                token: generateToken(user._id.toString())
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

            if (!user.password) {
                res.status(400).json({ message: 'This account was created with a wallet. Please login with wallet.' });
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
                    UserName: user.UserName,
                    email: user.email,
                    walletAddress: user.walletAddress,
                    firstName: user.firstName,
                    lastName: user.lastName
                },
                token: generateToken(user._id.toString())
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
        res.json({
            UserName: user.UserName,
            email: user.email,
            walletAddress: user.walletAddress,
            firstName: user.firstName,
            lastName: user.lastName
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

        res.json({
            UserName: updatedUser.UserName,
            email: updatedUser.email,
            walletAddress: updatedUser.walletAddress,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            token: generateToken(updatedUser._id.toString())
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};
