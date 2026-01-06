import { type Address } from 'viem';
import { getPerpetualContract } from '../utils/contract.js';
import { OracleService } from './oracle.service.js';
import type { Position, PositionSummary } from '../models/position.model.js';
import dotenv from 'dotenv';

dotenv.config();
const ONE = BigInt('1000000000000000000');

/**
 * Position Service - Tracks and manages user positions
 */
export class PositionService {
    private positions: Map<Address, Position> = new Map();
    private oracleService: OracleService;

    constructor(oracleService: OracleService) {
        this.oracleService = oracleService;
    }

    /**
     * Get position for a user
     */
    async getPosition(user: Address): Promise<Position | null> {
        try {
            const contract = getPerpetualContract();
            
            // Use getAccountSummary for efficient data retrieval
            const summary = await contract.read.getAccountSummary([user]) as any;
            
            // If no position (size is 0), return null
            if (!summary || summary.size === 0n || summary.size === '0') {
                return null;
            }

            // Get lastFundingIndex from accounts mapping (not included in summary)
            const accountData = await contract.read.accounts([user]) as any;
            const lastFundingIndex = BigInt(accountData.position.lastFundingIndex.toString());
            
            const indexToken = process.env.INDEX_TOKEN_ADDRESS as Address;
            const markPrice = await this.oracleService.getPrice(indexToken);
            
            const position: Position = {
                user,
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

            this.positions.set(user, position);
            return position;
        } catch (error) {
            console.error('Error fetching position:', error);
            throw error;
        }
    }

    /**
     * Get position summary (human-readable)
     */
    async getPositionSummary(user: Address): Promise<PositionSummary | null> {
        const position = await this.getPosition(user);
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
    updatePositionFromEvent(user: Address, eventData: any): void {
        // TODO: Update position cache based on event data
        const existing = this.positions.get(user);
        if (existing) {
            // Update existing position
            this.positions.set(user, {
                ...existing,
                ...eventData,
                lastUpdated: Date.now(),
            });
        }
    }
}

