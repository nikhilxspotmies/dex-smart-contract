import { type Address } from 'viem';
import { getPerpetualContract, getOracleContract } from '../utils/contract.js';
import type { PerpetualOrder, OrderRequest } from '../models/order.model.js';

/**
 * Perpetual Service - Handles order matching and trade execution
 */
export class PerpetualService {
    private orders: Map<string, PerpetualOrder> = new Map();

    /**
     * Submit a new order
     */
    async submitOrder(user: Address, orderRequest: OrderRequest): Promise<string> {
        // Validate order
        if (orderRequest.size === '0' || parseFloat(orderRequest.size) <= 0) {
            throw new Error('Invalid order size');
        }

        if (orderRequest.leverage < 1 || orderRequest.leverage > 10) {
            throw new Error('Leverage must be between 1x and 10x');
        }

        // Create order
        const orderId = `${user}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sizeInWei = BigInt(Math.floor(parseFloat(orderRequest.size) * 1e18));
        const signedSize = orderRequest.side === 'long' ? sizeInWei : -sizeInWei;
        const priceInWei = orderRequest.price ? BigInt(Math.floor(parseFloat(orderRequest.price) * 1e18)) : undefined;

        const order: PerpetualOrder = {
            id: orderId,
            user,
            side: orderRequest.side,
            type: orderRequest.type,
            size: signedSize,
            price: priceInWei,
            leverage: orderRequest.leverage,
            timestamp: Date.now(),
            status: 'pending',
        };

        this.orders.set(orderId, order);

        // If market order, execute immediately
        if (orderRequest.type === 'market') {
            await this.executeMarketOrder(orderId);
        } else {
            // For limit orders, add to matching engine
            // TODO: Implement limit order matching
        }

        return orderId;
    }

    /**
     * Execute a market order immediately
     */
    private async executeMarketOrder(orderId: string): Promise<void> {
        const order = this.orders.get(orderId);
        if (!order || order.status !== 'pending') {
            throw new Error('Order not found or already processed');
        }

        try {
            const oracleContract = getOracleContract();
            
            // Get current mark price from oracle
            const indexToken = process.env.INDEX_TOKEN_ADDRESS as Address;
            const markPrice = await oracleContract.read.getPrice([indexToken]);

            // Execute trade on contract
            const contract = getPerpetualContract();
            await contract.write.trade([order.user, order.size, markPrice]);

            order.status = 'filled';
            order.filledSize = order.size;
            this.orders.set(orderId, order);
        } catch (error) {
            order.status = 'cancelled';
            this.orders.set(orderId, order);
            throw error;
        }
    }

    /**
     * Get order by ID
     */
    getOrder(orderId: string): PerpetualOrder | undefined {
        return this.orders.get(orderId);
    }

    /**
     * Get all orders for a user
     */
    getUserOrders(user: Address): PerpetualOrder[] {
        return Array.from(this.orders.values()).filter(order => order.user === user);
    }

    /**
     * Cancel an order
     */
    cancelOrder(orderId: string, user: Address): void {
        const order = this.orders.get(orderId);
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
        this.orders.set(orderId, order);
    }
}

