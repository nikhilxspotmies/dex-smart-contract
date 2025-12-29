import type { Request, Response } from 'express';
// import { PrismaClient, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { verifyOrderSignature, calculateOrderHash } from '../services/signature.service.js';

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
    createdAt: Date;
    updatedAt: Date;
}

// In-place variable for orders
export const orders: Order[] = [];

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
