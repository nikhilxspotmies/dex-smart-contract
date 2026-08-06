import type { Request, Response } from 'express';
import BlockchainService from '../services/BlockchainService.js';
import Trade from '../models/Trade.js';
import User from '../models/User.js';
import Complaint from '../models/Complaint.js';
import { normalizeAddress } from '../utils/addressUtils.js';


// problem here uniquley need to verify the crypto seller that request should not able to send by imposter..
export const createTrade = async (req: Request, res: Response): Promise<void> => {
    console.log("create trade route got hit...")
    try {
        const { purchaseId, listingId, buyer, seller, quantity, pricePerToken } = req.body;

        if (purchaseId === undefined || listingId === undefined || !buyer || !seller || !quantity || !pricePerToken) {
            res.status(400).json({ error: "Missing required fields" });
            return;
        }

        const existingTrade = await Trade.findOne({ purchaseId: Number(purchaseId) });
        if (existingTrade) {
            res.status(400).json({ error: "Trade already exists" });
            return;
        }

        const newTrade = await Trade.create({
            purchaseId: Number(purchaseId),
            listingId: Number(listingId),
            buyer,
            seller,
            quantity: Number(quantity),
            pricePerToken: Number(pricePerToken),
            status: 'Locked'
        });

        // Referral Logic: Reward referrer if this is the first trade for buyer or seller
        const processReferral = async (address: string, role: string) => {
            try {
                // H1: validate address format before use in query (prevents regex injection/ReDoS)
                const addr = normalizeAddress(address);
                if (!addr) return;
                const user = await User.findOne({ walletAddress: { $regex: `^${addr}$`, $options: 'i' } });
                if (user && !user.hasDoneFirstTrade) {
                    if (user.referredBy) {
                        const refAddr = normalizeAddress(user.referredBy);
                        if (refAddr) {
                            await User.updateOne(
                                { walletAddress: { $regex: `^${refAddr}$`, $options: 'i' } },
                                { $inc: { referralPoints: 100 } }
                            );
                            console.log(`Referral Reward (P2P ${role}): received 100 points for referring ${addr}`);
                        }
                    }
                    user.hasDoneFirstTrade = true;
                    await user.save();
                }
            } catch (refError) {
                console.error(`Referral Logic Error (P2P ${role}):`, refError);
            }
        };

        await processReferral(buyer, 'Buyer');
        await processReferral(seller, 'Seller');

        res.status(201).json(newTrade);
    } catch (error: any) {
        console.error("Create Trade Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

export const releaseFunds = async (req: Request, res: Response): Promise<void> => {
    console.log("Release funds got hit...")
    try {
        const { purchaseId } = req.body;

        if (purchaseId === undefined) {
            res.status(400).json({ error: "purchaseId is required" });
            return;
        }

        // @ts-ignore
        const userWallet = req.user.walletAddress as string;
        // H1: normalize address from session before use in query
        const walletAddr = normalizeAddress(userWallet);
        if (!walletAddr) {
            res.status(400).json({ error: 'Invalid wallet address in session' });
            return;
        }

        // Find trade specifically for this seller to avoid stale data collisions
        const trade = await Trade.findOne({
            purchaseId: Number(purchaseId),
            seller: { $regex: `^${walletAddr}$`, $options: 'i' }
        });

        if (!trade) {
            res.status(404).json({ error: "Trade not found or you are not the authorized seller" });
            return;
        }

        console.log("Checking Authorization:");
        console.log("Trade ID:", purchaseId);
        console.log("Trade Seller (DB):", trade.seller);
        console.log("User Wallet (Token):", walletAddr);
        console.log("Release funds got hit3...")


        // 2. Call Blockchain Service
        const txHash = await BlockchainService.releasePurchase(Number(purchaseId));

        // 3. Update DB
        trade.status = 'Released';
        await trade.save();

        console.log("Funds released successfully via Backend");

        res.status(200).json({ message: "Funds released successfully", txHash });

    } catch (error: any) {
        console.error("Release Funds Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};


export const getTradesByUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { address } = req.params;

        if (!address) {
            res.status(400).json({ error: "Address is required" });
            return;
        }

        // H1: validate address format before use in query (prevents regex injection/ReDoS)
        const addr = normalizeAddress(address);
        if (!addr) {
            res.status(400).json({ error: "Invalid wallet address" });
            return;
        }

        const trades = await Trade.find({
            $or: [
                { buyer: { $regex: `^${addr}$`, $options: 'i' } },
                { seller: { $regex: `^${addr}$`, $options: 'i' } }
            ]
        }).sort({ createdAt: -1 });

        res.status(200).json(trades);
    } catch (error: any) {
        console.error("Get User Trades Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};


export const reportNotReceived = async (req: Request, res: Response): Promise<void> => {
    console.log("Report not received got hit...")
    try {
        const { purchaseId } = req.body;

        if (purchaseId === undefined) {
            res.status(400).json({ error: "purchaseId is required" });
            return;
        }

        // @ts-ignore
        const userWallet = req.user.walletAddress as string;
        // H1: normalize address from session before use in query
        const walletAddr = normalizeAddress(userWallet);
        if (!walletAddr) {
            res.status(400).json({ error: 'Invalid wallet address in session' });
            return;
        }

        const trade = await Trade.findOne({
            purchaseId: Number(purchaseId),
            seller: { $regex: `^${walletAddr}$`, $options: 'i' }
        });

        if (!trade) {
            res.status(404).json({ error: "Trade not found or you are not the authorized seller" });
            return;
        }

        // Update status to Disputed
        trade.status = 'Disputed';
        await trade.save();

        // Create Complaint entry
        await Complaint.create({
            purchaseId: Number(purchaseId),
            reporter: walletAddr,
            reason: 'Seller reported payment not received'
        });

        console.log(`Trade ${purchaseId} reported as not received and status updated to Disputed`);

        res.status(200).json({ message: "Report submitted successfully. Our team will review the case." });

    } catch (error: any) {
        console.error("Report Not Received Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

export const createTradeMetadata = async (data: any) => {
    return await Trade.create(data);
};
