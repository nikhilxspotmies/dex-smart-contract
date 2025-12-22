import type { Request, Response } from 'express';
import SwapTrade from '../models/SwapTrade.js';

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
