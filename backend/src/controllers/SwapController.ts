import type { Request, Response } from 'express';
import Swap from '../models/Swap.js';
import ReferralService from '../services/ReferralService.js';

export const recordSwap = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userAddress, tokenIn, tokenOut, amountIn, amountOut, txHash, timestamp } = req.body;

        if (!userAddress || !txHash) {
            res.status(400).json({ error: "User Address and TxHash are required" });
            return;
        }

        // Save Swap
        const swap = await Swap.create({
            userAddress,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            txHash,
            timestamp: timestamp || new Date()
        });

        // Trigger Referral Logic (Check if first trade)
        await ReferralService.checkAndAwardReferral(userAddress);

        res.status(201).json({ message: "Swap recorded successfully", swap });

    } catch (error: any) {
        console.error("Record Swap Error:", error);
        // If duplicate key (txHash), generic error
        if (error.code === 11000) {
            res.status(409).json({ error: "Swap already recorded" });
            return;
        }
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

export const getSwapsByUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { address } = req.params;
        if (!address) {
            res.status(400).json({ error: "Address is required" });
            return;
        }

        const swaps = await Swap.find({
            userAddress: { $regex: new RegExp(`^${address}$`, 'i') }
        }).sort({ timestamp: -1 });

        res.status(200).json(swaps);
    } catch (error: any) {
        console.error("Get Swaps Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};
