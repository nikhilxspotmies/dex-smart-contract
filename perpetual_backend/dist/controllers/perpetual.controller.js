import {} from 'viem';
import { PerpetualService } from '../services/perpetual.service.js';
import { OracleService } from '../services/oracle.service.js';
import { FundingService } from '../services/funding.service.js';
import { PositionService } from '../services/position.service.js';
import { getAllMarkets } from '../utils/markets.js';
import { getMarketConfig } from '../utils/contract.js';
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();
// Initialize services
const perpetualService = new PerpetualService();
const oracleService = new OracleService();
const fundingService = new FundingService();
const positionService = new PositionService(oracleService);
// Validation schemas
const orderSchema = z.object({
    market: z.string().optional(), // Market symbol (e.g., "ETH-PERP")
    side: z.enum(['long', 'short']),
    type: z.enum(['market', 'limit']),
    size: z.string().min(1),
    price: z.string().optional(),
    leverage: z.number().min(1).max(10),
});
const priceSchema = z.object({
    market: z.string().optional(), // Market symbol
    price: z.string().min(1),
});
const fundingRateSchema = z.object({
    market: z.string().optional(), // Market symbol
    rate: z.string().optional(), // Optional: if not provided, will calculate
});
/**
 * Get all available markets
 */
export async function getMarkets(req, res) {
    try {
        const markets = getAllMarkets();
        res.json({ markets });
    }
    catch (error) {
        console.error('Error fetching markets:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch markets' });
    }
}
/**
 * Submit a new order
 */
export async function submitOrder(req, res) {
    try {
        const user = req.body.user;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }
        const validated = orderSchema.parse(req.body);
        const orderRequest = {
            market: validated.market, // Optional, will use default if not provided
            side: validated.side,
            type: validated.type,
            size: validated.size,
            price: validated.price,
            leverage: validated.leverage,
        };
        const orderId = await perpetualService.submitOrder(user, orderRequest);
        res.json({ orderId, status: 'submitted' });
    }
    catch (error) {
        console.error('Error submitting order:', error);
        res.status(400).json({ error: error.message || 'Failed to submit order' });
    }
}
/**
 * Get user position for a specific market
 * GET /positions/:address/:market or GET /positions/:address (uses default market)
 */
export async function getPositions(req, res) {
    try {
        const user = req.params.address;
        const marketSymbol = req.params.market || req.query.market;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }
        const summary = await positionService.getPositionSummary(user, marketSymbol);
        if (!summary) {
            return res.json({ position: null, market: marketSymbol || 'default' });
        }
        res.json({ position: summary });
    }
    catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch positions' });
    }
}
/**
 * Get current mark price for a market
 * GET /mark-price/:market or GET /mark-price (uses default market)
 */
export async function getMarkPrice(req, res) {
    try {
        const marketSymbol = req.params.market || req.query.market;
        const market = getMarketConfig(marketSymbol);
        const price = await oracleService.getPrice(market.indexToken);
        const priceFormatted = (Number(price) / 1e18).toFixed(2);
        res.json({
            price: price.toString(),
            priceFormatted,
            market: market.symbol,
            token: market.indexToken
        });
    }
    catch (error) {
        console.error('Error fetching mark price:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch mark price' });
    }
}
/**
 * Get current funding rate for a market
 * GET /funding-rate/:market or GET /funding-rate (uses default market)
 */
export async function getFundingRate(req, res) {
    try {
        const marketSymbol = req.params.market || req.query.market;
        const market = getMarketConfig(marketSymbol);
        const rate = fundingService.getCurrentRate(market.symbol);
        const rateFormatted = (Number(rate) / 1e18 * 100).toFixed(6); // As percentage
        res.json({
            rate: rate.toString(),
            rateFormatted: `${rateFormatted}%`,
            market: market.symbol
        });
    }
    catch (error) {
        console.error('Error fetching funding rate:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch funding rate' });
    }
}
/**
 * Deposit collateral
 */
export async function deposit(req, res) {
    try {
        // TODO: Implement deposit logic
        // User should call contract.deposit() directly from frontend
        // Backend might handle signature validation if needed
        res.json({ message: 'Deposit should be called directly on contract from frontend' });
    }
    catch (error) {
        console.error('Error processing deposit:', error);
        res.status(500).json({ error: error.message || 'Failed to process deposit' });
    }
}
/**
 * Withdraw collateral
 */
export async function withdraw(req, res) {
    try {
        // TODO: Implement withdraw logic
        // User should call contract.withdraw() directly from frontend
        res.json({ message: 'Withdraw should be called directly on contract from frontend' });
    }
    catch (error) {
        console.error('Error processing withdraw:', error);
        res.status(500).json({ error: error.message || 'Failed to process withdraw' });
    }
}
/**
 * Close position for a specific market
 */
export async function closePosition(req, res) {
    try {
        const user = req.body.user;
        const marketSymbol = req.body.market;
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }
        // Get position for the specified market (or default)
        const position = await positionService.getPosition(user, marketSymbol);
        if (!position || position.size === 0n) {
            return res.status(400).json({ error: 'No open position to close' });
        }
        const closeSize = -position.size; // Opposite of current size
        const orderRequest = {
            market: position.market, // Use the market from the position
            side: position.size > 0n ? 'short' : 'long',
            type: 'market',
            size: (closeSize < 0n ? -closeSize : closeSize).toString(),
            leverage: 1, // Not used for closing
        };
        const orderId = await perpetualService.submitOrder(user, orderRequest);
        res.json({ orderId, status: 'submitted', market: position.market });
    }
    catch (error) {
        console.error('Error closing position:', error);
        res.status(400).json({ error: error.message || 'Failed to close position' });
    }
}
/**
 * Admin: Set oracle price for a market
 */
export async function adminSetPrice(req, res) {
    try {
        // TODO: Add admin authentication
        const validated = priceSchema.parse(req.body);
        const marketSymbol = validated.market;
        const market = getMarketConfig(marketSymbol);
        const priceInWei = BigInt(Math.floor(parseFloat(validated.price) * 1e18));
        await oracleService.setPrice(market.indexToken, priceInWei);
        res.json({
            success: true,
            price: priceInWei.toString(),
            market: market.symbol,
            token: market.indexToken
        });
    }
    catch (error) {
        console.error('Error setting price:', error);
        res.status(500).json({ error: error.message || 'Failed to set price' });
    }
}
/**
 * Admin: Update funding rate for a market
 */
export async function adminUpdateFunding(req, res) {
    try {
        // TODO: Add admin authentication
        const validated = fundingRateSchema.parse(req.body);
        const marketSymbol = validated.market;
        const market = getMarketConfig(marketSymbol);
        let rate;
        if (validated.rate) {
            rate = BigInt(Math.floor(parseFloat(validated.rate) * 1e18));
        }
        else {
            // Calculate from positions (simplified - would need actual long/short sizes)
            rate = fundingService.calculateFundingRate(0n, 0n);
        }
        await fundingService.updateFundingIndex(market.symbol, rate);
        res.json({
            success: true,
            rate: rate.toString(),
            market: market.symbol
        });
    }
    catch (error) {
        console.error('Error updating funding rate:', error);
        res.status(500).json({ error: error.message || 'Failed to update funding rate' });
    }
}
