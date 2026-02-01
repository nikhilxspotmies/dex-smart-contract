import { type Address } from 'viem';
import { getOracleContract } from '../utils/contract.js';

/**
 * Oracle Service - Manages price updates
 */
export class OracleService {
    private currentPrices: Map<Address, bigint> = new Map();

    /**
     * Get current price for a token
     */
    async getPrice(token: Address): Promise<bigint> {
        try {
            const contract = getOracleContract();
            const price = await contract.read.getPrice([token]);
            this.currentPrices.set(token, price);
            return price;
        } catch (error) {
            console.error('Error fetching price:', error);
            // Return cached price if available, otherwise throw
            const cached = this.currentPrices.get(token);
            if (cached) return cached;
            throw error;
        }
    }

    /**
     * Set price for a token (admin only)
     */
    async setPrice(token: Address, price: bigint): Promise<void> {
        try {
            const contract = getOracleContract();
            await contract.write.setPrice([token, price]);
            
            this.currentPrices.set(token, price);
            console.log(`Price updated for token ${token}: ${price.toString()}`);
        } catch (error) {
            console.error('Error setting price:', error);
            throw error;
        }
    }

    /**
     * Get cached price (no network call)
     */
    getCachedPrice(token: Address): bigint | undefined {
        return this.currentPrices.get(token);
    }
}

