import type { Request, Response } from 'express';
import SwapTrade from '../models/SwapTrade.js';

import User from '../models/User.js';

export const storeSwap = async (req: Request, res: Response) => {
    try {
        const { userAddress, tokenIn, tokenOut, amountIn, amountOut, txHash } = req.body;

        if (!userAddress || !tokenIn || !tokenOut || !amountIn || !amountOut) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const newSwap = new SwapTrade({
            userAddress,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            txHash
        });

        await newSwap.save();

        // Referral Logic
        try {
            const currentUser = await User.findOne({ walletAddress: { $regex: new RegExp(`^${userAddress}$`, 'i') } });

            if (currentUser && !currentUser.hasDoneFirstTrade) {
                if (currentUser.referredBy) {
                    const referrer = await User.findOne({ walletAddress: { $regex: new RegExp(`^${currentUser.referredBy}$`, 'i') } });
                    if (referrer) {
                        referrer.referralPoints = (referrer.referralPoints || 0) + 100;
                        await referrer.save();
                        console.log(`Referral Reward (Swap): ${referrer.walletAddress} received 100 points`);
                    }
                }
                currentUser.hasDoneFirstTrade = true;
                await currentUser.save();
            }
        } catch (refError) {
            console.error("Referral Logic Error (Swap):", refError);
        }

        res.status(201).json({ message: "Swap recorded successfully", swap: newSwap });
    } catch (error) {
        console.error("Error storing swap:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getSwapsByUser = async (req: Request, res: Response) => {
    try {
        const { userAddress } = req.params;

        if (!userAddress) {
            return res.status(400).json({ error: "User address is required" });
        }

        const swaps = await SwapTrade.find({ userAddress }).sort({ timestamp: -1 });
        res.json(swaps);
    } catch (error) {
        console.error("Error fetching swaps:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
