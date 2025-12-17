import type { Request, Response } from 'express';
import BlockchainService from '../services/BlockchainService.js';
import Trade from '../models/Trade.js';


// problem here uniquley need to verify the crypto seller that request should not able to send by imposter..
export const releaseFunds = async (req: Request, res: Response): Promise<void> => {
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


        // 2. Call Blockchain Service
        const txHash = await BlockchainService.releasePurchase(Number(purchaseId));

        // 3. Update DB
        trade.status = 'Released';
        await trade.save();

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
