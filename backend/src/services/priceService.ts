import { ethers } from 'ethers';
import Candle from '../models/Candle.js';

// ABI for the Pyth/Chainlink Oracle or the Market contract itself to get the price
const MARKET_ABI = [
    "function getOraclePrice() view returns (uint256)",
    "function baseSymbol() view returns (string)"
];

// Configuration for markets to track
const TRACKED_MARKETS = [
    {
        symbol: 'ETH',
        addressEnvKey: 'PERP_MARKET_ADDRESS', // We will read the actual address from process.env
    },
    {
        symbol: 'BTC',
        addressEnvKey: 'VITE_PERP_MARKET_BTC_ADDRESS', // Assuming we add this to backend .env
    }
];

export class PriceService {
    private provider: ethers.JsonRpcProvider;
    private isRunning: boolean = false;
    private currentCandles: Map<string, Map<string, any>> = new Map(); // symbol -> timeframe -> partial candle

    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('Starting Price Service...');

        // Start polling loop
        this.pollPrices(); // Call immediately
        setInterval(() => this.pollPrices(), 5000); // Poll every 5 seconds (simulating ticks)
    }

    private async pollPrices() {
        try {
            // For now, simpler implementation: Just verify ETH price is readable.
            // In a real production system, we would listen to events or poll high-frequency.

            const ethMarketAddress = process.env.VITE_PERP_MARKET_ADDRESS || process.env.PERP_MARKET_ADDRESS;
            // Note: For this demo/MVP, assuming getting mock price if contract call fails or just generating movement
            // for "alive" feeling charts on localhost if contracts are paused/not returning changes.

            // However, let's try to do it properly with the contract first.
            if (ethMarketAddress) {
                await this.processMarket('ETH', ethMarketAddress);
            }

            // We can add BTC later once confirmed ETH works
            const btcMarketAddress = process.env.VITE_PERP_MARKET_BTC_ADDRESS;
            if (btcMarketAddress) {
                await this.processMarket('BTC', btcMarketAddress);
            }

        } catch (error) {
            console.error('Error in pollPrices:', error);
        }
    }

    private async processMarket(symbol: string, marketAddress: string) {
        try {
            const marketContract = new ethers.Contract(marketAddress, MARKET_ABI, this.provider);

            let price = 0;
            try {
                // Read Oracle Price 18 decimals
                const priceBig = await (marketContract as any).getOraclePrice();
                price = Number(ethers.formatUnits(priceBig, 18));
            } catch (e) {
                console.error(`Failed to read price for ${symbol} at ${marketAddress}:`, e);
                // Do NOT fallback to random data if we want real data
                return;
            }

            if (price === 0) {
                console.warn(`Price for ${symbol} is 0. Skipping candle update.`);
                return;
            }

            console.log(`[PriceService] ${symbol} Price: ${price}`);

            // Now, aggregate this "Tick" into candles
            // We want to update the "Current" candle for each timeframe
            const timeframes = ['1m', '5m', '30m', '2h', '1d'];

            for (const tf of timeframes) {
                await this.updateCandle(symbol, tf, price);
            }

        } catch (error) {
            console.error(`Error processing market ${symbol}:`, error);
        }
    }

    private async updateCandle(symbol: string, timeframe: string, price: number) {
        const now = Math.floor(Date.now() / 1000);
        const candleSize = this.getTimeframeSeconds(timeframe);
        const candleTimestamp = Math.floor(now / candleSize) * candleSize; // Round down to nearest timeframe start

        // Check if we already have an active candle in memory for this TF
        // Using a unique key for the map
        const key = `${symbol}-${timeframe}`;
        // We can just use MongoDB upsert logic which is safer for multiple instances/restarts

        // Logic:
        // 1. Find existing candle for this timestamp + symbol + timeframe
        // 2. If exists, update high/low/close
        // 3. If not, create new

        // Using findOneAndUpdate with upsert
        const candle: any = await Candle.findOne({
            symbol,
            timeframe,
            time: candleTimestamp
        });

        if (candle) {
            // Update existing
            candle.high = Math.max(candle.high, price);
            candle.low = Math.min(candle.low, price);
            candle.close = price;
            await candle.save();
        } else {
            // Create new
            // We need to know the 'open'. Ideally, it's the 'close' of the previous candle.
            // Or if this is the very first tick of the new minute, it's 'price'.

            // Try to find previous candle close
            const prevTimestamp = candleTimestamp - candleSize;
            const prevCandle = await Candle.findOne({ symbol, timeframe, time: prevTimestamp });
            const open = prevCandle ? prevCandle.close : price;

            await Candle.create({
                symbol,
                timeframe,
                time: candleTimestamp,
                open: open,
                high: price,
                low: price,
                close: price
            });
        }
    }

    private getTimeframeSeconds(tf: string): number {
        switch (tf) {
            case '1m': return 60;
            case '5m': return 5 * 60;
            case '30m': return 30 * 60;
            case '2h': return 2 * 60 * 60;
            case '1d': return 24 * 60 * 60;
            default: return 60;
        }
    }

    // Mock price generator for stability/demo if contracts are offline
    private lastMockPrices: Record<string, number> = { 'ETH': 3000, 'BTC': 40000 };
    private getMockPrice(symbol: string): number {
        if (!this.lastMockPrices[symbol]) this.lastMockPrices[symbol] = 1000;

        const change = (Math.random() - 0.5) * (this.lastMockPrices[symbol] * 0.002); // 0.1% volatility roughly
        this.lastMockPrices[symbol] += change;
        return this.lastMockPrices[symbol];
    }
}

export const priceService = new PriceService();
