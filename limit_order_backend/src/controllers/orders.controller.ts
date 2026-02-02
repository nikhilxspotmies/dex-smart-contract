import type { Request, Response } from 'express';
// import { PrismaClient, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { verifyOrderSignature, calculateOrderHash, verifyCancellationSignature } from '../services/signature.service.js';

// Define OrderStatus enum locally to avoid dependency on Prisma client for types
export enum OrderStatus {
    OPEN = 'OPEN',
    FILLED = 'FILLED',
    CANCELLED = 'CANCELLED'
}

// In-memory order storage interface
export interface Order {
    orderHash: string;
    makerAsset: string;
    takerAsset: string;
    maker: string;
    makingAmount: string;
    takingAmount: string;
    salt: string;
    deadline: number;
    signature: string;
    status: OrderStatus;
    filledMakingAmount: string;
    createdAt: Date;
    updatedAt: Date;
}

// In-place variable for orders
export const orders: Order[] = [];

// In-place variable for last traded prices (key: "AssetA-AssetB", value: price)
// In-place variable for last traded prices (key: "AssetA-AssetB", value: price)
export const lastTradedPrices = new Map<string, string>();

// In-place variable for price history (key: "AssetA-AssetB", value: Array<{ price: string, timestamp: number }>)
export const priceHistory = new Map<string, Array<{ price: string, timestamp: number }>>();

// ... existing code ...

export const getPriceHistory = async (req: Request, res: Response) => {
    try {
        const { symbol, base, quote } = req.query;

        let key = symbol as string;
        let inverseKey = "";

        if (!key && base && quote) {
            key = `${base}-${quote}`;
            inverseKey = `${quote}-${base}`;
        }

        if (!key) {
            return res.status(400).json({ error: 'symbol or (base and quote) parameters are required' });
        }

        let history = priceHistory.get(key) || [];

        // If strict key not found, check inverse and invert prices
        if (history.length === 0 && inverseKey) {
            const inverseHistory = priceHistory.get(inverseKey);
            if (inverseHistory && inverseHistory.length > 0) {
                history = inverseHistory.map(item => ({
                    price: (1 / parseFloat(item.price)).toString(),
                    timestamp: item.timestamp
                }));
            }
        }

        return res.status(200).json({ symbol: key, history });
    } catch (error) {
        console.error('Get price history error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// const prisma = new PrismaClient();

const OrderSchema = z.object({
    order: z.object({
        makerAsset: z.string(),
        takerAsset: z.string(),
        maker: z.string(),
        makingAmount: z.string(),
        takingAmount: z.string(),
        salt: z.string(),
        deadline: z.number(),
    }),
    signature: z.string(),
});

export const createOrder = async (req: Request, res: Response) => {
    try {
        const validation = OrderSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Invalid input', details: validation.error.format() });
        }

        const { order, signature } = validation.data;

        const chainId = Number(req.app.get('chainId')) || Number(process.env.CHAIN_ID) || 31337;
        const protocolAddress = req.app.get('protocolAddress') || process.env.LIMIT_ORDER_ADDRESS;

        if (!protocolAddress) {
            return res.status(500).json({ error: 'Protocol address not configured' });
        }

        // 1. Verify Signature
        const isValid = await verifyOrderSignature(order, signature, chainId, protocolAddress);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        // 2. Calculate Order Hash
        const orderHash = calculateOrderHash(order, chainId, protocolAddress);

        // 3. Save to In-memory Storage
        if (orders.some(o => o.orderHash === orderHash)) {
            return res.status(409).json({ error: 'Order already exists' });
        }

        const newOrder: Order = {
            orderHash,
            makerAsset: order.makerAsset.toLowerCase(),
            takerAsset: order.takerAsset.toLowerCase(),
            maker: order.maker.toLowerCase(),
            makingAmount: order.makingAmount,
            takingAmount: order.takingAmount,
            salt: order.salt,
            deadline: order.deadline,
            signature,
            status: OrderStatus.OPEN,
            filledMakingAmount: "0",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        orders.push(newOrder);

        // const newOrder = await prisma.order.create({
        //     data: {
        //         orderHash,
        //         makerAsset: order.makerAsset.toLowerCase(),
        //         takerAsset: order.takerAsset.toLowerCase(),
        //         maker: order.maker.toLowerCase(),
        //         makingAmount: order.makingAmount,
        //         takingAmount: order.takingAmount,
        //         salt: order.salt,
        //         deadline: order.deadline,
        //         signature,
        //         status: OrderStatus.OPEN,
        //     },
        // });

        return res.status(201).json(newOrder);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Order already exists' });
        }
        console.error('Create order error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOrderbook = async (req: Request, res: Response) => {
    try {
        const { makerAsset, takerAsset } = req.query;

        if (!makerAsset || !takerAsset) {
            return res.status(400).json({ error: 'makerAsset and takerAsset are required' });
        }

        const filteredOrders = orders
            .filter(o =>
                o.makerAsset === (makerAsset as string).toLowerCase() &&
                o.takerAsset === (takerAsset as string).toLowerCase() &&
                o.status === OrderStatus.OPEN &&
                o.deadline > Math.floor(Date.now() / 1000)
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // const orders = await prisma.order.findMany({
        //     where: {
        //         makerAsset: (makerAsset as string).toLowerCase(),
        //         takerAsset: (takerAsset as string).toLowerCase(),
        //         status: OrderStatus.OPEN,
        //         deadline: {
        //             gt: Math.floor(Date.now() / 1000),
        //         },
        //     },
        //     orderBy: {
        //         createdAt: 'desc',
        //     },
        // });

        return res.status(200).json(filteredOrders);
    } catch (error) {
        console.error('Get orderbook error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getLastPrice = async (req: Request, res: Response) => {
    try {
        const { symbol, base, quote } = req.query;

        let key = symbol as string;
        let inverseKey = "";

        if (!key && base && quote) {
            key = `${base}-${quote}`;
            inverseKey = `${quote}-${base}`;
        }

        if (!key) {
            return res.status(400).json({ error: 'symbol or (base and quote) parameters are required' });
        }

        let price = lastTradedPrices.get(key);

        if (!price && inverseKey) {
            const inversePrice = lastTradedPrices.get(inverseKey);
            if (inversePrice) {
                // If we have price for B-A (Quote/Base), but want A-B, then price is 1 / inversePrice
                price = (1 / parseFloat(inversePrice)).toString();
            }
        }

        if (!price) {
            // Return 200 with 0 or null to avoid console 404s as per user preference "initially it is zero"
            return res.status(200).json({ symbol: key, price: "0" });
        }

        return res.status(200).json({ symbol: key, price });
    } catch (error) {
        console.error('Get last price error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDebugOrders = async (req: Request, res: Response) => {
    return res.status(200).json(orders);
};

export const deleteOrder = async (req: Request, res: Response) => {
    try {
        const { orderHash, signature } = req.body;

        if (!orderHash || !signature) {
            return res.status(400).json({ error: 'orderHash and signature are required' });
        }

        // 1. Find the order
        const orderIndex = orders.findIndex(o => o.orderHash === orderHash);
        if (orderIndex === -1) {
            return res.status(404).json({ error: 'Order not found' });
        }
        const order = orders[orderIndex];

        // 2. Verify Signature (User signs the orderHash they want to cancel)
        const chainId = Number(req.app.get('chainId')) || Number(process.env.CHAIN_ID) || 31337;
        const protocolAddress = req.app.get('protocolAddress') || process.env.LIMIT_ORDER_ADDRESS;

        const isValid = await verifyCancellationSignature(
            orderHash,
            signature,
            order.maker,
            chainId,
            protocolAddress
        );

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature. Only the maker can cancel this order.' });
        }

        // 3. Delete Order
        orders.splice(orderIndex, 1);
        console.log(`🗑️ Order deleted: ${orderHash}`);

        return res.status(200).json({ success: true, message: 'Order deleted successfully' });

    } catch (error) {
        console.error('Delete order error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
