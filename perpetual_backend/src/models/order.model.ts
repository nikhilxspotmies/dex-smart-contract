/**
 * Order model types
 */

import { type Address } from 'viem';

export type OrderSide = 'long' | 'short';
export type OrderType = 'market' | 'limit';

export interface PerpetualOrder {
    id: string;
    user: Address;
    market: string; // Market symbol (e.g., "ETH-PERP")
    side: OrderSide;
    type: OrderType;
    size: bigint; // Size in 1e18 (signed: + for long, - for short)
    price?: bigint; // Only for limit orders (1e18)
    leverage: number;
    timestamp: number;
    status: 'pending' | 'matched' | 'cancelled' | 'filled';
    filledSize?: bigint;
}

export interface OrderRequest {
    market?: string; // Market symbol (e.g., "ETH-PERP"). Optional, uses default if not provided
    side: OrderSide;
    type: OrderType;
    size: string; // Human readable size
    price?: string; // Human readable price (for limit orders)
    leverage: number;
}

