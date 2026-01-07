/**
 * Position model types
 */

export interface Position {
    user: string;
    market: string; // Market symbol (e.g., "ETH-PERP")
    size: bigint; // Signed: + for long, - for short (1e18)
    entryPrice: bigint; // 1e18
    marginBalance: bigint; // 1e18 (can be negative)
    unrealizedPnl: bigint; // 1e18
    marginRatio: bigint; // 1e18 (as percentage)
    leverage: bigint; // 1e18
    markPrice: bigint; // 1e18
    lastFundingIndex: bigint;
    lastUpdated: number;
}

export interface PositionSummary {
    user: string;
    market: string; // Market symbol (e.g., "ETH-PERP")
    size: string; // Human readable
    entryPrice: string; // Human readable
    markPrice: string; // Human readable
    marginBalance: string; // Human readable
    unrealizedPnl: string; // Human readable (signed)
    marginRatio: string; // Percentage
    leverage: string; // Multiplier
    isLong: boolean;
    liquidationPrice: string; // Human readable
}

