import { Request, Response } from 'express';
import { type Address } from 'viem';
import { PerpetualService } from '../services/perpetual.service.js';
import { OracleService } from '../services/oracle.service.js';
import { FundingService } from '../services/funding.service.js';
import { PositionService } from '../services/position.service.js';
import type { OrderRequest } from '../models/order.model.js';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Initialize services
const perpetualService = new PerpetualService();
const oracleService = new OracleService();
const fundingService = new FundingService();
const positionService = new PositionService(oracleService);

const INDEX_TOKEN = process.env.INDEX_TOKEN_ADDRESS as Address;

// Validation schemas
const orderSchema = z.object({
    side: z.enum(['long', 'short']),
    type: z.enum(['market', 'limit']),
    size: z.string().min(1),
    price: z.string().optional(),
    leverage: z.number().min(1).max(10),
});

const priceSchema = z.object({
    price: z.string().min(1),
});

const fundingRateSchema = z.object({
    rate: z.string().optional(), // Optional: if not provided, will calculate
});

/**
 * Submit a new order
 */
export async function submitOrder(req: Request, res: Response) {
    try {
        const user = req.body.user as Address;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }

        const validated = orderSchema.parse(req.body);
        const orderRequest: OrderRequest = {
            side: validated.side,
            type: validated.type,
            size: validated.size,
            price: validated.price,
            leverage: validated.leverage,
        };

        const orderId = await perpetualService.submitOrder(user, orderRequest);
        res.json({ orderId, status: 'submitted' });
    } catch (error: any) {
        console.error('Error submitting order:', error);
        res.status(400).json({ error: error.message || 'Failed to submit order' });
    }
}

/**
 * Get user positions
 */
export async function getPositions(req: Request, res: Response) {
    try {
        const user = req.params.address as Address;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }

        const summary = await positionService.getPositionSummary(user);
        if (!summary) {
            return res.json({ position: null });
        }

        res.json({ position: summary });
    } catch (error: any) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch positions' });
    }
}

/**
 * Get current mark price
 */
export async function getMarkPrice(req: Request, res: Response) {
    try {
        const price = await oracleService.getPrice(INDEX_TOKEN);
        const priceFormatted = (Number(price) / 1e18).toFixed(2);
        res.json({ price: price.toString(), priceFormatted });
    } catch (error: any) {
        console.error('Error fetching mark price:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch mark price' });
    }
}

/**
 * Get current funding rate
 */
export async function getFundingRate(req: Request, res: Response) {
    try {
        const rate = fundingService.getCurrentRate();
        const rateFormatted = (Number(rate) / 1e18 * 100).toFixed(6); // As percentage
        res.json({ rate: rate.toString(), rateFormatted: `${rateFormatted}%` });
    } catch (error: any) {
        console.error('Error fetching funding rate:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch funding rate' });
    }
}

/**
 * Deposit collateral
 */
export async function deposit(req: Request, res: Response) {
    try {
        // TODO: Implement deposit logic
        // User should call contract.deposit() directly from frontend
        // Backend might handle signature validation if needed
        res.json({ message: 'Deposit should be called directly on contract from frontend' });
    } catch (error: any) {
        console.error('Error processing deposit:', error);
        res.status(500).json({ error: error.message || 'Failed to process deposit' });
    }
}

/**
 * Withdraw collateral
 */
export async function withdraw(req: Request, res: Response) {
    try {
        // TODO: Implement withdraw logic
        // User should call contract.withdraw() directly from frontend
        res.json({ message: 'Withdraw should be called directly on contract from frontend' });
    } catch (error: any) {
        console.error('Error processing withdraw:', error);
        res.status(500).json({ error: error.message || 'Failed to process withdraw' });
    }
}

/**
 * Close position
 */
export async function closePosition(req: Request, res: Response) {
    try {
        const user = req.body.user as Address;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }

        // Submit a market order to close position
        const position = await positionService.getPosition(user);
        if (!position || position.size === 0n) {
            return res.status(400).json({ error: 'No open position to close' });
        }

        const closeSize = -position.size; // Opposite of current size
        const orderRequest: OrderRequest = {
            side: position.size > 0n ? 'short' : 'long',
            type: 'market',
            size: (closeSize < 0n ? -closeSize : closeSize).toString(),
            leverage: 1, // Not used for closing
        };

        const orderId = await perpetualService.submitOrder(user, orderRequest);
        res.json({ orderId, status: 'submitted' });
    } catch (error: any) {
        console.error('Error closing position:', error);
        res.status(400).json({ error: error.message || 'Failed to close position' });
    }
}

/**
 * Admin: Set oracle price
 */
export async function adminSetPrice(req: Request, res: Response) {
    try {
        // TODO: Add admin authentication
        const validated = priceSchema.parse(req.body);
        const priceInWei = BigInt(Math.floor(parseFloat(validated.price) * 1e18));
        
        await oracleService.setPrice(INDEX_TOKEN, priceInWei);
        res.json({ success: true, price: priceInWei.toString() });
    } catch (error: any) {
        console.error('Error setting price:', error);
        res.status(500).json({ error: error.message || 'Failed to set price' });
    }
}

/**
 * Admin: Update funding rate
 */
export async function adminUpdateFunding(req: Request, res: Response) {
    try {
        // TODO: Add admin authentication
        const validated = fundingRateSchema.parse(req.body);
        
        let rate: bigint;
        if (validated.rate) {
            rate = BigInt(Math.floor(parseFloat(validated.rate) * 1e18));
        } else {
            // Calculate from positions (simplified - would need actual long/short sizes)
            rate = fundingService.calculateFundingRate(0n, 0n);
        }
        
        await fundingService.updateFundingIndex(rate);
        res.json({ success: true, rate: rate.toString() });
    } catch (error: any) {
        console.error('Error updating funding rate:', error);
        res.status(500).json({ error: error.message || 'Failed to update funding rate' });
    }
}

