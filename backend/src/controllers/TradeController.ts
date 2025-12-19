import type { Request, Response } from 'express';
import BlockchainService from '../services/BlockchainService.js';
import Trade from '../models/Trade.js';


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

        const trade = await Trade.findOne({ purchaseId: Number(purchaseId) });
        if (!trade) {
            res.status(404).json({ error: "Trade not found" });
            return;
        }

        if (trade.status !== 'Locked' && trade.status !== 'Disputed') {
            if (trade.status === 'Released') {
                res.status(400).json({ error: "Trade already released" });
                return;
            }
        }

        // Verify that the requester is the seller (using case-insensitive check)
        // @ts-ignore
        const userWallet = req.user.walletAddress;
        if (!userWallet || trade.seller.toLowerCase() !== userWallet.toLowerCase()) {
            res.status(403).json({ error: "Not authorized to release this trade" });
            return;
        }


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

        // Case-insensitive search for buyer or seller matching the address
        const trades = await Trade.find({
            $or: [
                { buyer: { $regex: new RegExp(`^${address}$`, 'i') } },
                { seller: { $regex: new RegExp(`^${address}$`, 'i') } }
            ]
        }).sort({ createdAt: -1 });

        res.status(200).json(trades);
    } catch (error: any) {
        console.error("Get User Trades Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

export const createTradeMetadata = async (data: any) => {
    return await Trade.create(data);
};
