import type { Request, Response } from 'express';
import { type Address } from 'viem';
import { PerpetualService } from '../services/perpetual.service.js';
import { OracleService } from '../services/oracle.service.js';
import { FundingService } from '../services/funding.service.js';
import { PositionService } from '../services/position.service.js';
import type { OrderRequest } from '../models/order.model.js';
import { getAllMarkets } from '../utils/markets.js';
import { getMarketConfig, getPerpetualContract, getOracleContract, publicClient } from '../utils/contract.js';
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
export async function getMarkets(req: Request, res: Response) {
    try {
        const markets = getAllMarkets();
        res.json({ markets });
    } catch (error: any) {
        console.error('Error fetching markets:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch markets' });
    }
}

/**
 * Get orderbook for a market (pending limit orders)
 * GET /orderbook/:market or GET /orderbook (uses default market)
 */
export async function getOrderbook(req: Request, res: Response) {
    try {
        const marketSymbol = req.params.market || req.query.market as string || getMarketConfig().symbol;
        
        const orderbook = perpetualService.getOrderbook(marketSymbol);
        
        // Format orders for frontend (convert bigint to strings)
        // Size is signed internally but we send absolute value for display
        const formatOrders = (orders: any[]) => {
            return orders.map(order => {
                const rawSize = BigInt(order.size?.toString() || '0');
                const absSize = rawSize < 0n ? -rawSize : rawSize;
                return {
                    id: order.id,
                    price: order.price?.toString() || '0',
                    size: absSize.toString(), // Send absolute value for display
                    side: order.side,
                    timestamp: order.timestamp,
                };
            });
        };

        // Calculate cumulative totals for orderbook display
        let bidTotal = 0n;
        const bids = formatOrders(orderbook.bids).map(order => {
            const size = BigInt(order.size);
            bidTotal += size < 0n ? -size : size;
            return {
                ...order,
                total: bidTotal.toString(),
            };
        });

        let askTotal = 0n;
        const asks = formatOrders(orderbook.asks).map(order => {
            const size = BigInt(order.size);
            askTotal += size < 0n ? -size : size;
            return {
                ...order,
                total: askTotal.toString(),
            };
        });

        res.json({
            market: marketSymbol,
            bids,
            asks,
        });
    } catch (error: any) {
        console.error('Error fetching orderbook:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch orderbook' });
    }
}

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
            market: validated.market, // Optional, will use default if not provided
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
 * Get user position for a specific market
 * GET /positions/:address/:market or GET /positions/:address (uses default market)
 */
export async function getPositions(req: Request, res: Response) {
    try {
        const user = req.params.address as Address;
        const marketSymbol = req.params.market || req.query.market as string;
        
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }

        const summary = await positionService.getPositionSummary(user, marketSymbol);
        if (!summary) {
            return res.json({ position: null, market: marketSymbol || 'default' });
        }

        res.json({ position: summary });
    } catch (error: any) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch positions' });
    }
}

/**
 * Get current mark price for a market
 * GET /mark-price/:market or GET /mark-price (uses default market)
 */
export async function getMarkPrice(req: Request, res: Response) {
    try {
        const marketSymbol = req.params.market || req.query.market as string;
        const market = getMarketConfig(marketSymbol);
        
        const price = await oracleService.getPrice(market.indexToken);
        const priceFormatted = (Number(price) / 1e18).toFixed(2);
        res.json({ 
            price: price.toString(), 
            priceFormatted,
            market: market.symbol,
            token: market.indexToken
        });
    } catch (error: any) {
        console.error('Error fetching mark price:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch mark price' });
    }
}

/**
 * Get current funding rate for a market
 * GET /funding-rate/:market or GET /funding-rate (uses default market)
 */
export async function getFundingRate(req: Request, res: Response) {
    try {
        const marketSymbol = req.params.market || req.query.market as string;
        const market = getMarketConfig(marketSymbol);
        
        const rate = fundingService.getCurrentRate(market.symbol);
        const rateFormatted = (Number(rate) / 1e18 * 100).toFixed(6); // As percentage
        res.json({ 
            rate: rate.toString(), 
            rateFormatted: `${rateFormatted}%`,
            market: market.symbol
        });
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
 * Close position - Execute immediately at mark price (oracle price)
 * This ensures PnL is realized immediately without waiting for a counterparty
 * Optionally uses System LP as counterparty for proper settlement
 */
export async function closePosition(req: Request, res: Response) {
    try {
        const user = req.body.user as Address;
        const marketSymbol = req.body.market as string;
        
        if (!user) {
            return res.status(400).json({ error: 'User address required' });
        }

        // Get position for the specified market (or default)
        const position = await positionService.getPosition(user, marketSymbol);
        if (!position || position.size === 0n) {
            return res.status(400).json({ error: 'No open position to close' });
        }

        // Get current mark price (oracle price) - this is the fair price for closing
        const market = getMarketConfig(marketSymbol || position.market);
        const oracleContract = getOracleContract();
        const markPrice = await oracleContract.read.getPrice([market.indexToken]);

        // Calculate the size to close (opposite of current position)
        // If long +100, close with -100 (selling)
        const closeSize = -position.size;

        console.log(`[ClosePosition] Closing position for ${user}:`);
        console.log(`  - Market: ${market.symbol}`);
        console.log(`  - Current position size: ${position.size}`);
        console.log(`  - Entry price: ${position.entryPrice}`);
        console.log(`  - Close size: ${closeSize}`);
        console.log(`  - Closing at mark price: ${markPrice} (this will be used for PnL calculation)`);

        // IMPORTANT: Execute the trade directly at mark price
        // This settles the position immediately and realizes PnL
        // PnL = (Mark Price - Entry Price) × Size for long positions
        const contract = getPerpetualContract(market.symbol);
        
        // Optional: Execute System LP as counterparty for proper settlement
        const USE_SYNTHETIC_LP = process.env.USE_SYNTHETIC_LP === 'true';
        const SYSTEM_LP_ADDRESS = process.env.SYSTEM_LP_ADDRESS as Address | undefined;

        if (USE_SYNTHETIC_LP && SYSTEM_LP_ADDRESS) {
            // Execute trade for System LP as counterparty (opposite side)
            const systemLpTradeSize = -closeSize; // Opposite side
            console.log(`[ClosePosition] Using System LP as counterparty: ${SYSTEM_LP_ADDRESS}`);
            console.log(`[ClosePosition] System LP trade size: ${systemLpTradeSize}`);
            
            try {
                // Execute System LP trade first (takes the opposite position)
                const systemLpTxHash = await contract.write.trade([SYSTEM_LP_ADDRESS, systemLpTradeSize, markPrice]);
                console.log(`[ClosePosition] System LP trade transaction: ${systemLpTxHash}`);
                
                // Wait for System LP transaction to confirm
                const systemLpReceipt = await publicClient.waitForTransactionReceipt({ hash: systemLpTxHash });
                if (systemLpReceipt.status === 'reverted') {
                    throw new Error('System LP trade transaction reverted');
                }
                console.log(`[ClosePosition] System LP trade confirmed in block ${systemLpReceipt.blockNumber}`);
            } catch (systemLpError: any) {
                console.error('[ClosePosition] System LP trade failed:', systemLpError);
                // Continue with user trade even if System LP fails (might work if contract has liquidity)
                console.log('[ClosePosition] Continuing with user trade despite System LP failure');
            }
        }
        
        // Execute the trade on-chain for the user - this will calculate and add realized PnL to margin balance
        const txHash = await contract.write.trade([user, closeSize, markPrice]);
        
        console.log(`[ClosePosition] User trade transaction submitted: ${txHash}`);

        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        
        if (receipt.status === 'reverted') {
            // Try to get revert reason if available
            let errorMessage = 'Transaction reverted: Position close failed.';
            try {
                // Attempt to get revert reason (this might not always work)
                errorMessage = 'Transaction reverted: Position close failed. Check contract requirements and System LP balance.';
            } catch {
                // Use default message
            }
            throw new Error(errorMessage);
        }

        console.log(`[ClosePosition] Position closed successfully:`);
        console.log(`  - Transaction: ${txHash}`);
        console.log(`  - Block: ${receipt.blockNumber}`);
        console.log(`  - Mark price used: ${markPrice}`);
        console.log(`  - PnL has been realized and added to margin balance`);

        // Get updated position to verify it's closed
        const updatedPosition = await positionService.getPosition(user, marketSymbol || position.market);
        const positionClosed = !updatedPosition || updatedPosition.size === 0n;

        res.json({ 
            success: true,
            txHash,
            blockNumber: receipt.blockNumber.toString(),
            closedSize: closeSize.toString(),
            closePrice: markPrice.toString(), // Mark price used for settlement
            entryPrice: position.entryPrice.toString(),
            market: position.market,
            positionClosed,
            message: 'Position closed successfully. PnL has been realized and added to your margin balance.'
        });
    } catch (error: any) {
        console.error('[ClosePosition] Error closing position:', error);
        
        // Provide more detailed error messages
        let errorMessage = error.message || 'Failed to close position';
        let statusCode = 400;
        
        // Handle specific error cases
        if (errorMessage.includes('reverted')) {
            errorMessage = 'Transaction reverted. This may be due to: insufficient margin, contract constraints, or System LP balance issues.';
            statusCode = 400;
        } else if (errorMessage.includes('No open position')) {
            errorMessage = 'No open position found to close.';
            statusCode = 404;
        } else if (errorMessage.includes('User address required')) {
            errorMessage = 'User address is required to close position.';
            statusCode = 400;
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            details: error.details || undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

/**
 * Admin: Set oracle price for a market
 */
export async function adminSetPrice(req: Request, res: Response) {
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
    } catch (error: any) {
        console.error('Error setting price:', error);
        res.status(500).json({ error: error.message || 'Failed to set price' });
    }
}

/**
 * Admin: Update funding rate for a market
 */
export async function adminUpdateFunding(req: Request, res: Response) {
    try {
        // TODO: Add admin authentication
        const validated = fundingRateSchema.parse(req.body);
        const marketSymbol = validated.market;
        const market = getMarketConfig(marketSymbol);
        
        let rate: bigint;
        if (validated.rate) {
            rate = BigInt(Math.floor(parseFloat(validated.rate) * 1e18));
        } else {
            // Calculate from positions (simplified - would need actual long/short sizes)
            rate = fundingService.calculateFundingRate(0n, 0n);
        }
        
        await fundingService.updateFundingIndex(market.symbol, rate);
        res.json({ 
            success: true, 
            rate: rate.toString(),
            market: market.symbol
        });
    } catch (error: any) {
        console.error('Error updating funding rate:', error);
        res.status(500).json({ error: error.message || 'Failed to update funding rate' });
    }
}

