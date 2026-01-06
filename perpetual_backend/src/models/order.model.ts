/**
 * Order model types
 */

export type OrderSide = 'long' | 'short';
export type OrderType = 'market' | 'limit';

export interface PerpetualOrder {
    id: string;
    user: string;
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
    side: OrderSide;
    type: OrderType;
    size: string; // Human readable size
    price?: string; // Human readable price (for limit orders)
    leverage: number;
}

