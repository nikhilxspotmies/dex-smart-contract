import { getPerpetualContract } from '../utils/contract.js';
/**
 * Funding Service - Handles funding rate calculations and updates per market
 */
export class FundingService {
    // Store funding rates per market: market -> rate
    currentRates = new Map();
    lastUpdates = new Map();
    /**
     * Calculate funding rate based on long/short imbalance
     * For MVP: Simple calculation, can be enhanced later
     */
    calculateFundingRate(longSize, shortSize) {
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
     * Update funding index on contract for a specific market
     * @param marketSymbol - Market symbol (e.g., "ETH-PERP")
     * @param rate - Funding rate
     */
    async updateFundingIndex(marketSymbol, rate) {
        try {
            const contract = getPerpetualContract(marketSymbol);
            await contract.write.updateIndex([rate]);
            this.currentRates.set(marketSymbol, rate);
            this.lastUpdates.set(marketSymbol, Date.now());
            console.log(`Funding rate updated for ${marketSymbol}: ${rate.toString()}`);
        }
        catch (error) {
            console.error(`Error updating funding rate for ${marketSymbol}:`, error);
            throw error;
        }
    }
    /**
     * Get current funding rate for a market
     * @param marketSymbol - Market symbol. If not provided, returns default market rate
     */
    getCurrentRate(marketSymbol) {
        if (marketSymbol) {
            return this.currentRates.get(marketSymbol) || 0n;
        }
        // Return first available rate (for backward compatibility)
        const rates = Array.from(this.currentRates.values());
        return rates.length > 0 ? rates[0] : 0n;
    }
    /**
     * Periodic funding update (should be called every 8 hours)
     * @param marketSymbol - Market symbol
     * @param longSize - Total long position size
     * @param shortSize - Total short position size
     */
    async performPeriodicUpdate(marketSymbol, longSize, shortSize) {
        const newRate = this.calculateFundingRate(longSize, shortSize);
        await this.updateFundingIndex(marketSymbol, newRate);
    }
}
