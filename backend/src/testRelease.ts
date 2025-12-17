
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Trade from './models/Trade.js';
import { releaseFunds } from './controllers/TradeController.js';
import BlockchainService from './services/BlockchainService.js';
import type { Request, Response } from 'express';

// Mock the Blockchain Service
BlockchainService.releasePurchase = async (id: number): Promise<string> => {
    console.log(`[MOCK] BlockchainService.releasePurchase called with ID: ${id}`);
    return "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
};

const runTest = async () => {
    try {
        await connectDB();

        // 1. Setup Test Data
        const testPurchaseId = 999;
        await Trade.deleteOne({ purchaseId: testPurchaseId }); // Cleanup

        await Trade.create({
            purchaseId: testPurchaseId,
            listingId: 1,
            buyer: "0xBuyerAddress",
            seller: "0xSellerAddress",
            status: "Locked"
        });
        console.log("✅ Test Trade Created (Locked)");

        // 2. Mock Request/Response
        const req = {
            body: { purchaseId: testPurchaseId }
        } as Request;

        const res = {
            status: (code: number) => {
                console.log(`[Response Status]: ${code}`);
                return res;
            },
            json: (data: any) => {
                console.log(`[Response Body]:`, data);
                return res;
            }
        } as unknown as Response;

        // 3. Execute Controller
        console.log("🚀 Calling releaseFunds controller...");
        await releaseFunds(req, res);

        // 4. Verify DB Status
        const updatedTrade = await Trade.findOne({ purchaseId: testPurchaseId });
        if (updatedTrade?.status === 'Released') {
            console.log("✅ SUCCESS: Trade status updated to 'Released' in DB.");
        } else {
            console.error("❌ FAILURE: Trade status is", updatedTrade?.status);
        }

    } catch (error) {
        console.error("Test Error:", error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

runTest();
