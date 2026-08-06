import type { Request, Response } from 'express';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { verifyOrderSignature, calculateOrderHash, verifyCancellationSignature } from '../services/signature.service.js';

export { OrderStatus };
export type { Order } from '@prisma/client';

export const prisma = new PrismaClient();

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

        const isValid = await verifyOrderSignature(order, signature, chainId, protocolAddress);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const orderHash = calculateOrderHash(order, chainId, protocolAddress);

        const newOrder = await prisma.order.create({
            data: {
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
                filledMakingAmount: '0',
            },
        });

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

        const orders = await prisma.order.findMany({
            where: {
                makerAsset: (makerAsset as string).toLowerCase(),
                takerAsset: (takerAsset as string).toLowerCase(),
                status: OrderStatus.OPEN,
                deadline: { gt: Math.floor(Date.now() / 1000) },
            },
            orderBy: { createdAt: 'desc' },
        });

        return res.status(200).json(orders);
    } catch (error) {
        console.error('Get orderbook error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getLastPrice = async (req: Request, res: Response) => {
    try {
        const { symbol, base, quote } = req.query;
        console.log(`📡 GET /last-price params:`, req.query);

        let key = symbol as string;
        let inverseKey = '';

        if (!key && base && quote) {
            key = `${base}-${quote}`;
            inverseKey = `${quote}-${base}`;
        }

        if (!key) {
            return res.status(400).json({ error: 'symbol or (base and quote) parameters are required' });
        }

        let price: string | undefined;
        const record = await prisma.lastTradedPrice.findUnique({ where: { key } });

        if (record) {
            price = record.price;
        } else if (inverseKey) {
            const inverseRecord = await prisma.lastTradedPrice.findUnique({ where: { key: inverseKey } });
            if (inverseRecord) {
                price = (1 / parseFloat(inverseRecord.price)).toString();
            }
        }

        if (!price) {
            return res.status(200).json({ symbol: key, price: '0', high24h: '0', low24h: '0', change24h: '0', volume24h: '0' });
        }

        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const history = await prisma.priceHistory.findMany({
            where: { key, timestamp: { gt: oneDayAgo } },
            orderBy: { timestamp: 'asc' },
        });

        let high24h = parseFloat(price);
        let low24h = parseFloat(price);
        let volume24h = 0;
        let change24h = 0;

        if (history.length > 0) {
            const prices = history.map(h => parseFloat(h.price));
            high24h = Math.max(...prices);
            low24h = Math.min(...prices);
            volume24h = history.reduce((acc, h) => acc + parseFloat(h.volume), 0);
            const firstPrice = parseFloat(history[0].price);
            change24h = ((parseFloat(price) - firstPrice) / firstPrice) * 100;
        }

        return res.status(200).json({
            symbol: key,
            price,
            high24h: high24h.toString(),
            low24h: low24h.toString(),
            change24h: change24h.toFixed(2),
            volume24h: volume24h.toString(),
        });
    } catch (error) {
        console.error('Get last price error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPriceHistory = async (req: Request, res: Response) => {
    try {
        const { symbol, base, quote } = req.query;

        let key = symbol as string;
        let inverseKey = '';

        if (!key && base && quote) {
            key = `${base}-${quote}`;
            inverseKey = `${quote}-${base}`;
        }

        if (!key) {
            return res.status(400).json({ error: 'symbol or (base and quote) parameters are required' });
        }

        let history = await prisma.priceHistory.findMany({ where: { key }, orderBy: { timestamp: 'asc' } });

        if (history.length === 0 && inverseKey) {
            const inverseHistory = await prisma.priceHistory.findMany({ where: { key: inverseKey }, orderBy: { timestamp: 'asc' } });
            if (inverseHistory.length > 0) {
                return res.status(200).json({
                    symbol: key,
                    history: inverseHistory.map(item => ({
                        price: (1 / parseFloat(item.price)).toString(),
                        volume: item.volume,
                        timestamp: item.timestamp,
                    })),
                });
            }
        }

        return res.status(200).json({ symbol: key, history });
    } catch (error) {
        console.error('Get price history error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDebugOrders = async (req: Request, res: Response) => {
    const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
    return res.status(200).json(orders);
};

export const getUserOrders = async (req: Request, res: Response) => {
    try {
        const { address } = req.params;

        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }

        const orders = await prisma.order.findMany({
            where: { maker: address.toLowerCase() },
            orderBy: { createdAt: 'desc' },
        });

        return res.status(200).json(orders);
    } catch (error) {
        console.error('Get user orders error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteOrder = async (req: Request, res: Response) => {
    try {
        const { orderHash, signature } = req.body;

        if (!orderHash || !signature) {
            return res.status(400).json({ error: 'orderHash and signature are required' });
        }

        const order = await prisma.order.findUnique({ where: { orderHash } });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const chainId = Number(req.app.get('chainId')) || Number(process.env.CHAIN_ID) || 31337;
        const protocolAddress = req.app.get('protocolAddress') || process.env.LIMIT_ORDER_ADDRESS;

        const isValid = await verifyCancellationSignature(orderHash, signature, order.maker, chainId, protocolAddress);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature. Only the maker can cancel this order.' });
        }

        await prisma.order.update({ where: { orderHash }, data: { status: OrderStatus.CANCELLED } });
        console.log(`🗑️ Order cancelled: ${orderHash}`);

        return res.status(200).json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('Delete order error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
