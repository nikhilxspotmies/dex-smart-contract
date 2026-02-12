import { priceHistory, lastTradedPrices } from '../controllers/orders.controller.js';

export const seedData = () => {
    console.log('🌱 Seeding initial price history data...');

    // Seed BTC-USDC (Bitcoin price in USDC) ~ $3450
    const btcUsdcKey = "BTC-USDC";
    const now = Date.now();
    const btcHistory = [];
    let price = 3450.0;

    // Generate 60 points (1 hour of minute data)
    for (let i = 60; i >= 0; i--) {
        // Random walk
        const change = (Math.random() - 0.5) * 10;
        price += change;
        btcHistory.push({
            price: price.toFixed(2),
            volume: (Math.random() * 1000 + 500).toFixed(2),
            timestamp: now - (i * 60 * 1000)
        });
    }

    priceHistory.set(btcUsdcKey, btcHistory);
    lastTradedPrices.set(btcUsdcKey, price.toFixed(2));
    console.log(`Initialized ${btcUsdcKey} with ${btcHistory.length} data points. Last price: ${price.toFixed(2)}`);

    // Seed ETH-USDC (Ethereum price in USDC) ~ $2200
    const ethUsdcKey = "ETH-USDC";
    const ethHistory = [];
    let ethPrice = 2200.0;

    for (let i = 60; i >= 0; i--) {
        const change = (Math.random() - 0.5) * 5;
        ethPrice += change;
        ethHistory.push({
            price: ethPrice.toFixed(2),
            volume: (Math.random() * 500 + 200).toFixed(2),
            timestamp: now - (i * 60 * 1000)
        });
    }

    priceHistory.set(ethUsdcKey, ethHistory);
    lastTradedPrices.set(ethUsdcKey, ethPrice.toFixed(2));
    console.log(`Initialized ${ethUsdcKey} with ${ethHistory.length} data points. Last price: ${ethPrice.toFixed(2)}`);

    // Add explicit inverse for USDC-BTC (Price of USDC in BTC ~ 0.00029)
    // Controller handles inverse, but explicit setting can help debug
};
