import type { Request, Response } from 'express';
import PerpTrade, { type IPerpTrade, TradeType, TradeStatus } from '../models/PerpTrade.js';
import dotenv from 'dotenv';
dotenv.config();

import User from '../models/User.js';
import { normalizeAddress } from '../utils/addressUtils.js';

const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || "0x_UNKNOWN_MARKET";

export const createTrade = async (req: Request, res: Response): Promise<void> => {
    try {
        // legacy 'amount' mapped to 'size' if needed
        const { walletAddress, positionId, type, tokenSymbol, amount, size, collateral, price, pnl, txHash } = req.body;

        // Normalize size
        const tradeSize = size || amount;

        if (!walletAddress || !positionId || !type || !tokenSymbol || !tradeSize || !price || !txHash) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const isClose = type.toString().startsWith('CLOSE');
        const side = type.toString().includes('LONG') ? TradeType.LONG : TradeType.SHORT;

        if (!isClose) {
            // OPEN TRADE (Optimistic UI update)
            // We use upsert so if listener beat us, we just update/confirm
            const trade = await PerpTrade.findOneAndUpdate(
                { positionId },
                {
                    walletAddress,
                    positionId,
                    type: side,
                    tokenSymbol,
                    market: MARKET_ADDRESS,
                    size: tradeSize,
                    collateral: collateral || "0", // Frontend might not send collateral initially if legacy
                    entryPrice: price,
                    status: TradeStatus.OPEN,
                    openTxHash: txHash
                },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );

            // Referral Logic
            try {
                // H1: validate address format before use in query (prevents regex injection/ReDoS)
                const perpAddr = normalizeAddress(walletAddress);
                if (perpAddr) {
                    const currentUser = await User.findOne({ walletAddress: { $regex: `^${perpAddr}$`, $options: 'i' } });
                    if (currentUser && !currentUser.hasDoneFirstTrade) {
                        if (currentUser.referredBy) {
                            const refAddr = normalizeAddress(currentUser.referredBy);
                            if (refAddr) {
                                await User.updateOne(
                                    { walletAddress: { $regex: `^${refAddr}$`, $options: 'i' } },
                                    { $inc: { referralPoints: 100 } }
                                );
                                console.log(`Referral Reward (Perp): received 100 points for referring ${perpAddr}`);
                            }
                        }
                        currentUser.hasDoneFirstTrade = true;
                        await currentUser.save();
                    }
                }
            } catch (refError) {
                console.error("Referral Logic Error (Perp):", refError);
            }

            res.status(201).json(trade);
        } else {
            // CLOSE TRADE
            // Update existing
            const trade = await PerpTrade.findOneAndUpdate(
                { positionId },
                {
                    status: TradeStatus.CLOSED,
                    exitPrice: price,
                    pnl: pnl,
                    closeTxHash: txHash,
                    closedAt: new Date(),
                    size: "0", // Assume full close if frontend says Close? 
                    // Frontend 'CLOSE' usually implies full close in this context unless partial specified
                    collateral: "0"
                },
                { returnDocument: "after" }
            );

            if (trade) {
                res.status(200).json(trade);
            } else {
                // Orphaned close handling
                console.warn(`Orphaned close for position ${positionId}`);
                // Create a record anyway?
                const orphan = await PerpTrade.create({
                    walletAddress,
                    positionId,
                    type: side,
                    tokenSymbol,
                    market: MARKET_ADDRESS,
                    size: "0",
                    collateral: "0",
                    entryPrice: "0",
                    exitPrice: price,
                    pnl,
                    status: TradeStatus.CLOSED,
                    openTxHash: "unknown",
                    closeTxHash: txHash,
                    closedAt: new Date()
                });
                res.status(201).json(orphan);
            }
        }
    } catch (error: any) {
        console.error("Create Trade Error:", error);
        res.status(500).json({ message: 'Error saving trade', error: error.message });
    }
};

export const getTradesByAddress = async (req: Request, res: Response): Promise<void> => {
    try {
        const { walletAddress } = req.params;

        if (!walletAddress) {
            res.status(400).json({ message: 'Wallet address required' });
            return;
        }

        const trades = await PerpTrade.find({ walletAddress }).sort({ timestamp: -1 });
        res.status(200).json(trades);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching trades', error: error.message });
    }
};
