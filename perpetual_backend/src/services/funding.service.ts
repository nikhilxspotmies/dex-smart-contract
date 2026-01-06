import { getPerpetualContract } from '../utils/contract.js';

/**
 * Funding Service - Handles funding rate calculations and updates
 */
export class FundingService {
    private currentRate: bigint = 0n;
    private lastUpdate: number = Date.now();

    /**
     * Calculate funding rate based on long/short imbalance
     * For MVP: Simple calculation, can be enhanced later
     */
    calculateFundingRate(longSize: bigint, shortSize: bigint): bigint {
        if (longSize === 0n && shortSize === 0n) {
            return 0n;
        }

        const totalSize = longSize + shortSize;
        if (totalSize === 0n) {
            return 0n;
        }

        // Simple calculation: if more longs, longs pay shorts (positive rate)
        // Rate is per second in 1e18 format
        const imbalance = (longSize - shortSize) * BigInt('1000000000000000000') / totalSize; // -1e18 to 1e18
        
        // Convert to funding rate (e.g., 0.0001% per second = 1e14 per second)
        // For 8-hour funding: rate = imbalance * 1e14 / 1e18 = imbalance * 1e-4
        return (imbalance * BigInt('100000000000000')) / BigInt('1000000000000000000'); // 1e14 per 1e18
    }

    /**
     * Update funding index on contract
     */
    async updateFundingIndex(rate: bigint): Promise<void> {
        try {
            const contract = getPerpetualContract();
            await contract.write.updateIndex([rate]);
            
            this.currentRate = rate;
            this.lastUpdate = Date.now();
            console.log(`Funding rate updated: ${rate.toString()}`);
        } catch (error) {
            console.error('Error updating funding rate:', error);
            throw error;
        }
    }

    /**
     * Get current funding rate
     */
    getCurrentRate(): bigint {
        return this.currentRate;
    }

    /**
     * Periodic funding update (should be called every 8 hours)
     */
    async performPeriodicUpdate(longSize: bigint, shortSize: bigint): Promise<void> {
        const newRate = this.calculateFundingRate(longSize, shortSize);
        await this.updateFundingIndex(newRate);
    }
}

