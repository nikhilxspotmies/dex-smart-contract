import { type Address } from 'viem';
import { getPerpetualContract, getOracleContract, getMarketConfig, publicClient } from '../utils/contract.js';
import type { PerpetualOrder, OrderRequest } from '../models/order.model.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Perpetual Service - Handles order matching and trade execution
 */
export class PerpetualService {
    // Store orders per market: market -> orderId -> order
    private orders: Map<string, Map<string, PerpetualOrder>> = new Map();

    /**
     * Submit a new order
     * @param user - User address
     * @param orderRequest - Order request with optional market
     */
    async submitOrder(user: Address, orderRequest: OrderRequest): Promise<string> {
        console.log(`[PerpetualService] Received order request from ${user}:`, orderRequest);
        // Get market (default if not provided)
        const marketSymbol = orderRequest.market || getMarketConfig().symbol;
        const market = getMarketConfig(marketSymbol);

        // Validate order
        if (orderRequest.size === '0' || parseFloat(orderRequest.size) <= 0) {
            console.error('[PerpetualService] Invalid order size');
            throw new Error('Invalid order size');
        }

        if (orderRequest.leverage < 1 || orderRequest.leverage > 10) {
            console.error('[PerpetualService] Invalid leverage');
            throw new Error('Leverage must be between 1x and 10x');
        }

        // Create order
        const orderId = `${marketSymbol}-${user}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sizeInWei = BigInt(Math.floor(parseFloat(orderRequest.size) * 1e18));
        const signedSize = orderRequest.side === 'long' ? sizeInWei : -sizeInWei;
        const priceInWei = orderRequest.price ? BigInt(Math.floor(parseFloat(orderRequest.price) * 1e18)) : undefined;

        console.log(`[PerpetualService] Created order ${orderId} with size ${signedSize}`);

        const order: PerpetualOrder = {
            id: orderId,
            user,
            market: marketSymbol,
            side: orderRequest.side,
            type: orderRequest.type,
            size: signedSize,
            price: priceInWei,
            leverage: orderRequest.leverage,
            timestamp: Date.now(),
            status: 'pending',
        };

        // Store order per market
        if (!this.orders.has(marketSymbol)) {
            this.orders.set(marketSymbol, new Map());
        }
        this.orders.get(marketSymbol)!.set(orderId, order);

        // Try to match the new order with existing limit orders
        const remainingSize = await this.tryMatchOrder(orderId, marketSymbol);

        // Handle remaining unmatched portion
        if (remainingSize === 0n) {
            // Order fully matched
            if (orderRequest.type === 'limit') {
                console.log(`[PerpetualService] Limit order ${orderId} fully matched`);
            } else {
                console.log(`[PerpetualService] Market order ${orderId} fully matched`);
            }
        } else if (orderRequest.type === 'market') {
            // Market order with unmatched portion
            await this.handleUnmatchedMarketOrder(orderId, marketSymbol, remainingSize, order);
        } else if (orderRequest.type === 'limit' && remainingSize !== 0n) {
            // Limit order with remaining size stays in orderbook
            console.log(`[PerpetualService] Limit order ${orderId} partially filled, remaining size ${remainingSize} added to orderbook`);
        }

        return orderId;
    }

    /**
     * Try to match a new order with existing limit orders in the orderbook
     * @param orderId - ID of the order to match
     * @param marketSymbol - Market symbol
     * @returns Remaining unmatched size (0n if fully matched)
     */
    private async tryMatchOrder(orderId: string, marketSymbol: string): Promise<bigint> {
        const marketOrders = this.orders.get(marketSymbol);
        if (!marketOrders) {
            throw new Error(`Market ${marketSymbol} not found`);
        }

        const order = marketOrders.get(orderId);
        if (!order || order.status !== 'pending') {
            return 0n;
        }

        // Get opposite side orders from orderbook
        const orderbook = this.getOrderbook(marketSymbol);
        const oppositeOrders = order.side === 'long' ? orderbook.asks : orderbook.bids;

        if (oppositeOrders.length === 0) {
            console.log(`[PerpetualService] No matching orders found for ${orderId}`);
            return order.size; // No matches, return full size
        }

        let remainingSize = order.size;
        const isLong = order.side === 'long';
        const isMarket = order.type === 'market';

        console.log(`[PerpetualService] Attempting to match ${orderId} (${order.side}, size: ${order.size})...`);

        // Iterate through opposite orders and match if prices overlap
        for (const oppositeOrder of oppositeOrders) {
            // Check if we've fully matched the order
            let remainingAbs = remainingSize < 0n ? -remainingSize : remainingSize;
            if (remainingAbs === 0n) break;
            
            if (oppositeOrder.status !== 'pending' || oppositeOrder.type !== 'limit') continue;
            if (!oppositeOrder.price) continue;

            // Check if prices match
            let canMatch = false;
            let matchPrice = oppositeOrder.price;

            if (isMarket) {
                // Market orders can match with any limit order at the limit order's price
                canMatch = true;
            } else if (isLong && order.price) {
                // Long limit order matches if order price >= opposite order price
                canMatch = order.price >= oppositeOrder.price;
                matchPrice = oppositeOrder.price; // Use the better (lower) price for the buyer
            } else if (!isLong && order.price) {
                // Short limit order matches if order price <= opposite order price
                canMatch = order.price <= oppositeOrder.price;
                matchPrice = order.price; // Use the better (higher) price for the seller
            }

            if (!canMatch) {
                continue; // Price doesn't overlap, skip this order
            }

            // Calculate match size (minimum of remaining and opposite order size)
            // Recalculate remainingAbs in case it changed (shouldn't, but for safety)
            remainingAbs = remainingSize < 0n ? -remainingSize : remainingSize;
            const oppositeSize = oppositeOrder.size < 0n ? -oppositeOrder.size : oppositeOrder.size;
            const matchSize = remainingAbs < oppositeSize ? remainingAbs : oppositeSize;

            // Determine signed match size based on the new order's side
            const signedMatchSize = isLong ? matchSize : -matchSize;

            console.log(`[PerpetualService] Matched ${orderId} with ${oppositeOrder.id}: size=${signedMatchSize}, price=${matchPrice}`);

            try {
                // Execute the matched trade on-chain
                await this.executeMatchedTrade(
                    order.user,
                    oppositeOrder.user,
                    signedMatchSize,
                    matchPrice,
                    marketSymbol
                );

                // Update order statuses
                // Calculate remaining size: subtract the matched portion
                // For long (positive): remaining = original - matched (both positive)
                // For short (negative): remaining = original - matched = original - (-matchSize) = original + matchSize
                if (matchSize === remainingAbs) {
                    // New order fully matched
                    order.status = 'filled';
                    order.filledSize = order.size;
                    remainingSize = 0n;
                } else {
                    // New order partially matched
                    // Subtract the signed match size from remaining size
                    remainingSize = remainingSize - signedMatchSize;
                    order.filledSize = signedMatchSize;
                }

                if (matchSize === oppositeSize) {
                    // Opposite order fully matched
                    oppositeOrder.status = 'filled';
                    oppositeOrder.filledSize = oppositeOrder.size;
                } else {
                    // Opposite order partially matched
                    // Calculate new remaining size in absolute terms, then apply original sign
                    const newOppositeAbs = oppositeSize - matchSize;
                    const oppositeIsShort = oppositeOrder.size < 0n;
                    oppositeOrder.size = oppositeIsShort ? -BigInt(newOppositeAbs.toString()) : BigInt(newOppositeAbs.toString());
                    
                    // Calculate filled size (with correct sign)
                    const oppositeSignedMatch = oppositeIsShort ? -BigInt(matchSize.toString()) : BigInt(matchSize.toString());
                    oppositeOrder.filledSize = oppositeSignedMatch;
                }

                // Update orders in map
                marketOrders.set(orderId, order);
                marketOrders.set(oppositeOrder.id, oppositeOrder);

                if (remainingSize === 0n) break;

            } catch (error) {
                console.error(`[PerpetualService] Error executing matched trade:`, error);
                // Continue to next order if this one fails
                continue;
            }
        }

        return remainingSize;
    }

    /**
     * Execute a matched trade between two users on-chain
     * Waits for both transactions to confirm and validates success
     */
    private async executeMatchedTrade(
        user1: Address,
        user2: Address,
        size: bigint,
        price: bigint,
        marketSymbol: string
    ): Promise<void> {
        const contract = getPerpetualContract(marketSymbol);

        // Execute trade for user1 (the new order)
        const txHash1 = await contract.write.trade([user1, size, price]);
        console.log(`[PerpetualService] Trade tx for ${user1}: ${txHash1}`);

        // Execute trade for user2 (the matched order) with opposite size
        const txHash2 = await contract.write.trade([user2, -size, price]);
        console.log(`[PerpetualService] Trade tx for ${user2}: ${txHash2}`);

        // Wait for BOTH transactions to confirm - ensures atomicity
        try {
            const [receipt1, receipt2] = await Promise.all([
                publicClient.waitForTransactionReceipt({ hash: txHash1 }),
                publicClient.waitForTransactionReceipt({ hash: txHash2 })
            ]);

            // Validate both succeeded
            if (receipt1.status === 'reverted') {
                console.error(`[PerpetualService] Trade tx reverted for ${user1}: ${txHash1}`);
                throw new Error(`Trade execution failed for ${user1}: transaction reverted`);
            }
            if (receipt2.status === 'reverted') {
                console.error(`[PerpetualService] Trade tx reverted for ${user2}: ${txHash2}`);
                throw new Error(`Trade execution failed for ${user2}: transaction reverted`);
            }

            console.log(`[PerpetualService] Both trades confirmed successfully:`);
            console.log(`  - ${user1} confirmed in block ${receipt1.blockNumber}`);
            console.log(`  - ${user2} confirmed in block ${receipt2.blockNumber}`);

        } catch (error) {
            console.error(`[PerpetualService] Error executing matched trade:`, error);
            // Re-throw to allow caller to handle
            throw error;
        }
    }

    /**
     * Handle unmatched market order - convert to limit order or use synthetic counterparty
     */
    private async handleUnmatchedMarketOrder(
        orderId: string,
        marketSymbol: string,
        remainingSize: bigint,
        order: PerpetualOrder
    ): Promise<void> {
        const USE_SYNTHETIC_LP = process.env.USE_SYNTHETIC_LP === 'true';
        const SYSTEM_LP_ADDRESS = process.env.SYSTEM_LP_ADDRESS as Address | undefined;

        // Check if we should use synthetic counterparty
        if (USE_SYNTHETIC_LP && SYSTEM_LP_ADDRESS) {
            const orderbook = this.getOrderbook(marketSymbol);
            const hasOppositeOrders = order.side === 'long' 
                ? orderbook.asks.length > 0 
                : orderbook.bids.length > 0;
            
            // Only use synthetic counterparty if orderbook is completely empty on opposite side
            if (!hasOppositeOrders) {
                const market = getMarketConfig(marketSymbol);
                const oracleContract = getOracleContract();
                const oraclePrice = await oracleContract.read.getPrice([market.indexToken]);
                
                console.log(`[PerpetualService] No match found. Using synthetic counterparty ${SYSTEM_LP_ADDRESS}`);
                console.log(`[PerpetualService] Executing trade at oracle price: ${oraclePrice}`);
                
                try {
                    // Execute both trades with synthetic counterparty
                    await this.executeMatchedTrade(
                        order.user,
                        SYSTEM_LP_ADDRESS,
                        remainingSize, // Will be positive for long, negative for short
                        oraclePrice,
                        marketSymbol
                    );
                    
                    // Mark order as filled
                    order.status = 'filled';
                    order.filledSize = order.size;
                    const marketOrders = this.orders.get(marketSymbol);
                    if (marketOrders) {
                        marketOrders.set(orderId, order);
                    }
                    
                    console.log(`[PerpetualService] Market order ${orderId} executed with synthetic counterparty`);
                    return; // Done, don't convert to limit order
                } catch (error) {
                    console.error(`[PerpetualService] Failed to execute with synthetic counterparty:`, error);
                    console.log(`[PerpetualService] Falling back to limit order conversion`);
                    // Fall through to limit order conversion
                }
            }
        }

        // Convert unmatched market order to limit order at oracle price
        const market = getMarketConfig(marketSymbol);
        const oracleContract = getOracleContract();
        const oraclePrice = await oracleContract.read.getPrice([market.indexToken]);
        
        // Update order to be a limit order at oracle price
        order.type = 'limit';
        order.price = oraclePrice;
        order.size = remainingSize; // Update size to remaining unmatched portion
        
        const marketOrders = this.orders.get(marketSymbol);
        if (marketOrders) {
            marketOrders.set(orderId, order);
        }
        
        console.log(`[PerpetualService] Market order ${orderId} partially/unmatched. Converted to limit order:`);
        console.log(`  - Type: limit`);
        console.log(`  - Price: ${oraclePrice} (oracle price)`);
        console.log(`  - Remaining size: ${remainingSize}`);
        console.log(`[PerpetualService] Order ${orderId} added to orderbook waiting for match`);
    }


    /**
     * Execute a market order immediately (legacy method - kept for backward compatibility)
     */
    private async executeMarketOrder(orderId: string, marketSymbol: string): Promise<void> {
        const marketOrders = this.orders.get(marketSymbol);
        if (!marketOrders) {
            throw new Error(`Market ${marketSymbol} not found`);
        }

        const order = marketOrders.get(orderId);
        if (!order || order.status !== 'pending') {
            throw new Error('Order not found or already processed');
        }

        try {
            console.log(`[PerpetualService] Processing execution for ${orderId}...`);
            const market = getMarketConfig(marketSymbol);
            const oracleContract = getOracleContract();

            // Get current mark price from oracle for this market's token
            const markPrice = await oracleContract.read.getPrice([market.indexToken]);
            console.log(`[PerpetualService] Current mark price: ${markPrice}`);

            // Execute trade on market-specific contract
            const contract = getPerpetualContract(marketSymbol);
            console.log(`[PerpetualService] Submitting trade tx to contract...`);

            const txHash = await contract.write.trade([order.user, order.size, markPrice]);
            console.log(`[PerpetualService] Trade tx submitted: ${txHash}`);

            // Don't wait for confirmation - return immediately to avoid blocking
            // The transaction will be confirmed asynchronously
            order.status = 'pending'; // Keep as pending until confirmed
            marketOrders.set(orderId, order);

            // Wait for confirmation asynchronously (don't block the response)
            publicClient.waitForTransactionReceipt({ hash: txHash })
                .then((receipt) => {
                    if (receipt.status === 'reverted') {
                        console.error(`[PerpetualService] Transaction reverted: ${txHash}`);
                        order.status = 'cancelled';
                    } else {
                        console.log(`[PerpetualService] Transaction confirmed in block ${receipt.blockNumber}`);
                        order.status = 'filled';
                        order.filledSize = order.size;
                    }
                    marketOrders.set(orderId, order);
                })
                .catch((error) => {
                    console.error(`[PerpetualService] Error waiting for transaction confirmation:`, error);
                    order.status = 'cancelled';
                    marketOrders.set(orderId, order);
                });

            // Return immediately - transaction is submitted
            return;
        } catch (error) {
            console.error(`[PerpetualService] Execution failed for ${orderId}:`, error);
            order.status = 'cancelled';
            marketOrders.set(orderId, order);
            throw error;
        }
    }

    /**
     * Get order by ID
     * @param orderId - Order ID (contains market prefix)
     */
    getOrder(orderId: string): PerpetualOrder | undefined {
        // Order ID format: MARKET-USER-TIMESTAMP-RANDOM
        const parts = orderId.split('-');
        if (parts.length < 2) return undefined;

        const marketSymbol = parts[0];
        const marketOrders = this.orders.get(marketSymbol);
        return marketOrders?.get(orderId);
    }

    /**
     * Get all orders for a user (optionally filtered by market)
     */
    getUserOrders(user: Address, marketSymbol?: string): PerpetualOrder[] {
        const allOrders: PerpetualOrder[] = [];

        if (marketSymbol) {
            // Get orders for specific market
            const marketOrders = this.orders.get(marketSymbol);
            if (marketOrders) {
                allOrders.push(...Array.from(marketOrders.values()).filter(order => order.user === user));
            }
        } else {
            // Get orders from all markets
            for (const marketOrders of this.orders.values()) {
                allOrders.push(...Array.from(marketOrders.values()).filter(order => order.user === user));
            }
        }

        return allOrders;
    }

    /**
     * Cancel an order
     */
    cancelOrder(orderId: string, user: Address): void {
        const order = this.getOrder(orderId);
        if (!order) {
            throw new Error('Order not found');
        }
        if (order.user !== user) {
            throw new Error('Unauthorized');
        }
        if (order.status !== 'pending') {
            throw new Error('Order cannot be cancelled');
        }
        order.status = 'cancelled';
        const marketOrders = this.orders.get(order.market);
        if (marketOrders) {
            marketOrders.set(orderId, order);
        }
    }

    /**
     * Get orderbook data for a market (pending limit orders only)
     * Returns bids (buy orders) and asks (sell orders) sorted by price
     */
    getOrderbook(marketSymbol: string): { bids: PerpetualOrder[]; asks: PerpetualOrder[] } {
        const marketOrders = this.orders.get(marketSymbol);
        if (!marketOrders) {
            return { bids: [], asks: [] };
        }

        // Get all pending limit orders for this market
        const pendingOrders = Array.from(marketOrders.values()).filter(
            order => order.status === 'pending' && order.type === 'limit' && order.market === marketSymbol
        );

        // Separate into bids (long/buy orders) and asks (short/sell orders)
        const bids: PerpetualOrder[] = [];
        const asks: PerpetualOrder[] = [];

        for (const order of pendingOrders) {
            if (order.side === 'long' && order.price) {
                // Buy order - add to bids
                bids.push(order);
            } else if (order.side === 'short' && order.price) {
                // Sell order - add to asks
                asks.push(order);
            }
        }

        // Sort bids: highest price first (descending)
        bids.sort((a, b) => {
            const priceA = a.price || 0n;
            const priceB = b.price || 0n;
            return priceA > priceB ? -1 : priceA < priceB ? 1 : 0;
        });

        // Sort asks: lowest price first (ascending)
        asks.sort((a, b) => {
            const priceA = a.price || 0n;
            const priceB = b.price || 0n;
            return priceA < priceB ? -1 : priceA > priceB ? 1 : 0;
        });

        return { bids, asks };
    }
}

