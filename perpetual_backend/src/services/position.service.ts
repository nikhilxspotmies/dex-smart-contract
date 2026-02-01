import { type Address } from 'viem';
import { getPerpetualContract, getMarketConfig } from '../utils/contract.js';
import { OracleService } from './oracle.service.js';
import type { Position, PositionSummary } from '../models/position.model.js';

const ONE = BigInt('1000000000000000000');

/**
 * Position Service - Tracks and manages user positions across multiple markets
 */
export class PositionService {
    // Cache positions per market: "user-market" -> Position
    private positions: Map<string, Position> = new Map();
    private oracleService: OracleService;

    constructor(oracleService: OracleService) {
        this.oracleService = oracleService;
    }

    /**
     * Get position for a user in a specific market
     * @param user - User address
     * @param marketSymbol - Market symbol (e.g., "ETH-PERP"). If not provided, uses default market
     */
    async getPosition(user: Address, marketSymbol?: string): Promise<Position | null> {
        try {
            // Get market config
            const market = getMarketConfig(marketSymbol);
            const contract = getPerpetualContract(market.symbol);

            // Use getAccountSummary for efficient data retrieval
            const summary = await contract.read.getAccountSummary([user]) as any;

            // If no position (size is 0), return null
            if (!summary || summary.size === 0n || summary.size === '0') {
                return null;
            }

            // Get lastFundingIndex from accounts mapping
            // Note: solidity public mappings often return flattened values, not named structs
            const accountData = await contract.read.accounts([user]) as any;

            let lastFundingIndex = 0n;

            if (Array.isArray(accountData)) {
                // If array, lastFundingIndex is likely the 4th element (index 3) based on struct:
                // marginBalance, size, entryPrice, lastFundingIndex
                if (accountData.length >= 4) {
                    lastFundingIndex = BigInt(accountData[3].toString());
                }
            } else if (accountData && typeof accountData === 'object') {
                // If object, look for property or try to infer
                if ('lastFundingIndex' in accountData) {
                    lastFundingIndex = BigInt(accountData.lastFundingIndex.toString());
                } else if ('position' in accountData && accountData.position && 'lastFundingIndex' in accountData.position) {
                    // Nested case (unlikely but possible depending on generation)
                    lastFundingIndex = BigInt(accountData.position.lastFundingIndex.toString());
                }
            }

            // Get mark price for this market's token
            const markPrice = await this.oracleService.getPrice(market.indexToken);

            const position: Position = {
                user,
                market: market.symbol,
                size: BigInt(summary.size.toString()),
                entryPrice: BigInt(summary.entryPrice.toString()),
                marginBalance: BigInt(summary.marginBalance.toString()),
                unrealizedPnl: BigInt(summary.unrealizedPnl.toString()),
                marginRatio: BigInt(summary.marginRatio.toString()),
                leverage: BigInt(summary.leverage.toString()),
                markPrice,
                lastFundingIndex,
                lastUpdated: Date.now(),
            };

            // Cache position with market key
            const cacheKey = `${user}-${market.symbol}`;
            this.positions.set(cacheKey, position);
            return position;
        } catch (error) {
            console.error(`Error fetching position for ${user} in ${marketSymbol}:`, error);
            throw error;
        }
    }

    /**
     * Get all positions for a user across all markets
     */
    async getAllPositions(user: Address): Promise<Position[]> {
        // This would require iterating through all markets
        // For now, return cached positions or implement market discovery
        const userPositions: Position[] = [];
        for (const [key, position] of this.positions.entries()) {
            if (key.startsWith(`${user}-`)) {
                userPositions.push(position);
            }
        }
        return userPositions;
    }

    /**
     * Get position summary (human-readable) for a specific market
     * @param user - User address
     * @param marketSymbol - Market symbol (optional, uses default if not provided)
     */
    async getPositionSummary(user: Address, marketSymbol?: string): Promise<PositionSummary | null> {
        const position = await this.getPosition(user, marketSymbol);
        if (!position || position.size === 0n) {
            return null;
        }

        const formatBigInt = (value: bigint, decimals: number = 18): string => {
            const divisor = BigInt(10) ** BigInt(decimals);
            const whole = value / divisor;
            const fraction = value % divisor;
            const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6);
            return `${whole}.${fractionStr}`;
        };

        return {
            user: position.user,
            market: position.market,
            size: formatBigInt(position.size < 0n ? -position.size : position.size),
            entryPrice: formatBigInt(position.entryPrice),
            markPrice: formatBigInt(position.markPrice),
            marginBalance: formatBigInt(position.marginBalance),
            unrealizedPnl: formatBigInt(position.unrealizedPnl),
            marginRatio: formatBigInt(position.marginRatio, 16), // Percentage (1e16 = 1%)
            leverage: formatBigInt(position.leverage),
            isLong: position.size > 0n,
            liquidationPrice: '0', // TODO: Calculate liquidation price
        };
    }

    /**
     * Listen to contract events and update positions
     */
    startEventListening(): void {
        // TODO: Set up event listeners for Trade, Deposit, Withdraw, FundingPayment, Liquidation
        // This will keep positions in sync with on-chain state
        console.log('Position event listening started');
    }

    /**
     * Update position from event
     */
    updatePositionFromEvent(user: Address, market: string, eventData: any): void {
        // TODO: Update position cache based on event data
        const cacheKey = `${user}-${market}`;
        const existing = this.positions.get(cacheKey);
        if (existing) {
            // Update existing position
            this.positions.set(cacheKey, {
                ...existing,
                ...eventData,
                lastUpdated: Date.now(),
            });
        }
    }
}

