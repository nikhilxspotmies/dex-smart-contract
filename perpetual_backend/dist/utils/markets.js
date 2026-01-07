import {} from 'viem';
import dotenv from 'dotenv';
dotenv.config();
/**
 * Market registry - maps market symbols to their configurations
 *
 * Supports loading from environment variables or config file
 * Format: MARKET_<SYMBOL>_INDEX_TOKEN, MARKET_<SYMBOL>_CONTRACT
 *
 * Example env vars:
 * MARKET_ETH_PERP_INDEX_TOKEN=0x...
 * MARKET_ETH_PERP_CONTRACT=0x...
 * MARKET_BTC_PERP_INDEX_TOKEN=0x...
 * MARKET_BTC_PERP_CONTRACT=0x...
 */
class MarketRegistry {
    markets = new Map();
    defaultMarket = null;
    constructor() {
        this.loadMarkets();
    }
    /**
     * Load markets from environment variables
     */
    loadMarkets() {
        // Load from env vars
        // Format: MARKET_<SYMBOL>_INDEX_TOKEN, MARKET_<SYMBOL>_CONTRACT, MARKET_<SYMBOL>_NAME
        const envPrefix = 'MARKET_';
        // Find all market symbols from env vars
        const marketSymbols = new Set();
        for (const key in process.env) {
            if (key.startsWith(envPrefix) && key.endsWith('_INDEX_TOKEN')) {
                // Extract symbol: MARKET_ETH_PERP_INDEX_TOKEN -> ETH_PERP -> ETH-PERP
                const symbol = key
                    .replace(envPrefix, '')
                    .replace('_INDEX_TOKEN', '')
                    .replace(/_/g, '-');
                marketSymbols.add(symbol);
            }
        }
        // Load each market
        for (const symbol of marketSymbols) {
            const envKeyPrefix = `MARKET_${symbol.replace(/-/g, '_')}`;
            const indexToken = process.env[`${envKeyPrefix}_INDEX_TOKEN`];
            const perpetualAddress = process.env[`${envKeyPrefix}_CONTRACT`];
            const name = process.env[`${envKeyPrefix}_NAME`] || `${symbol.replace('-', ' ')} Market`;
            if (indexToken && perpetualAddress) {
                this.markets.set(symbol, {
                    symbol,
                    indexToken,
                    perpetualAddress,
                    name,
                });
            }
        }
        // Set default market (first one loaded, or from env)
        const defaultMarketSymbol = process.env.DEFAULT_MARKET;
        if (defaultMarketSymbol && this.markets.has(defaultMarketSymbol)) {
            this.defaultMarket = defaultMarketSymbol;
        }
        else if (this.markets.size > 0) {
            this.defaultMarket = Array.from(this.markets.keys())[0];
        }
        // Backward compatibility: if no markets loaded but old env vars exist
        if (this.markets.size === 0) {
            const oldIndexToken = process.env.INDEX_TOKEN_ADDRESS;
            const oldPerpetualAddress = process.env.PERPETUAL_CONTRACT_ADDRESS;
            if (oldIndexToken && oldPerpetualAddress) {
                const defaultSymbol = process.env.DEFAULT_MARKET_SYMBOL || 'TKA-PERP';
                this.markets.set(defaultSymbol, {
                    symbol: defaultSymbol,
                    indexToken: oldIndexToken,
                    perpetualAddress: oldPerpetualAddress,
                    name: 'Default Perpetual Market',
                });
                this.defaultMarket = defaultSymbol;
                console.warn(`⚠️  Using legacy env vars. Consider migrating to MARKET_<SYMBOL>_* format.`);
            }
        }
        console.log(`📊 Loaded ${this.markets.size} market(s): ${Array.from(this.markets.keys()).join(', ')}`);
        if (this.defaultMarket) {
            console.log(`📍 Default market: ${this.defaultMarket}`);
        }
    }
    /**
     * Get market configuration by symbol
     */
    getMarket(symbol) {
        return this.markets.get(symbol);
    }
    /**
     * Get default market
     */
    getDefaultMarket() {
        if (!this.defaultMarket)
            return null;
        return this.markets.get(this.defaultMarket) || null;
    }
    /**
     * Get all markets
     */
    getAllMarkets() {
        return Array.from(this.markets.values());
    }
    /**
     * Check if market exists
     */
    hasMarket(symbol) {
        return this.markets.has(symbol);
    }
    /**
     * Get default market symbol
     */
    getDefaultMarketSymbol() {
        return this.defaultMarket;
    }
    /**
     * Add market programmatically (for testing or dynamic registration)
     */
    addMarket(config) {
        this.markets.set(config.symbol, config);
        if (!this.defaultMarket) {
            this.defaultMarket = config.symbol;
        }
    }
}
// Export singleton instance
export const marketRegistry = new MarketRegistry();
// Convenience functions
export function getMarket(symbol) {
    return marketRegistry.getMarket(symbol);
}
export function getDefaultMarket() {
    return marketRegistry.getDefaultMarket();
}
export function getAllMarkets() {
    return marketRegistry.getAllMarkets();
}
export function hasMarket(symbol) {
    return marketRegistry.hasMarket(symbol);
}
export function getDefaultMarketSymbol() {
    return marketRegistry.getDefaultMarketSymbol();
}
