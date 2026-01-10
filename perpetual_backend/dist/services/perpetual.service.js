import {} from 'viem';
import { getPerpetualContract, getOracleContract, getMarketConfig, publicClient } from '../utils/contract.js';
/**
 * Perpetual Service - Handles order matching and trade execution
 */
export class PerpetualService {
    // Store orders per market: market -> orderId -> order
    orders = new Map();
    /**
     * Submit a new order
     * @param user - User address
     * @param orderRequest - Order request with optional market
     */
    async submitOrder(user, orderRequest) {
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
        const order = {
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
        this.orders.get(marketSymbol).set(orderId, order);
        // If market order, execute immediately
        if (orderRequest.type === 'market') {
            console.log(`[PerpetualService] Executing market order ${orderId}...`);
            await this.executeMarketOrder(orderId, marketSymbol);
        }
        else {
            // For limit orders, add to matching engine
            // TODO: Implement limit order matching
            console.log(`[PerpetualService] Limit order ${orderId} queued (not implemented)`);
        }
        return orderId;
    }
    /**
     * Execute a market order immediately
     */
    async executeMarketOrder(orderId, marketSymbol) {
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
            console.log(`[PerpetualService] Trade tx submitted: ${txHash}. Waiting for confirmation...`);
            // Wait for transaction receipt
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            if (receipt.status === 'reverted') {
                throw new Error(`Transaction reverted: ${txHash}`);
            }
            console.log(`[PerpetualService] Transaction confirmed in block ${receipt.blockNumber}`);
            order.status = 'filled';
            order.filledSize = order.size;
            marketOrders.set(orderId, order);
            console.log(`[PerpetualService] Order ${orderId} marked as filled`);
        }
        catch (error) {
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
    getOrder(orderId) {
        // Order ID format: MARKET-USER-TIMESTAMP-RANDOM
        const parts = orderId.split('-');
        if (parts.length < 2)
            return undefined;
        const marketSymbol = parts[0];
        const marketOrders = this.orders.get(marketSymbol);
        return marketOrders?.get(orderId);
    }
    /**
     * Get all orders for a user (optionally filtered by market)
     */
    getUserOrders(user, marketSymbol) {
        const allOrders = [];
        if (marketSymbol) {
            // Get orders for specific market
            const marketOrders = this.orders.get(marketSymbol);
            if (marketOrders) {
                allOrders.push(...Array.from(marketOrders.values()).filter(order => order.user === user));
            }
        }
        else {
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
    cancelOrder(orderId, user) {
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
}
