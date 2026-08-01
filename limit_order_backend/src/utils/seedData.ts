import { prisma } from '../controllers/orders.controller.js';

export const seedData = async () => {
    const existing = await prisma.lastTradedPrice.findFirst();
    if (existing) return;

    console.log('🌱 Seeding initial price history data...');

    const now = Date.now();

    const pairs = [
        { key: 'BTC-USDC', startPrice: 3450.0, step: 10 },
        { key: 'ETH-USDC', startPrice: 2200.0, step: 5 },
    ];

    for (const { key, startPrice, step } of pairs) {
        let price = startPrice;
        const history = [];

        for (let i = 60; i >= 0; i--) {
            price += (Math.random() - 0.5) * step;
            history.push({
                key,
                price: price.toFixed(2),
                volume: (Math.random() * 1000 + 500).toFixed(2),
                timestamp: now - i * 60 * 1000,
            });
        }

        await prisma.priceHistory.createMany({ data: history });
        await prisma.lastTradedPrice.upsert({
            where: { key },
            update: { price: price.toFixed(2) },
            create: { key, price: price.toFixed(2) },
        });

        console.log(`Initialized ${key} with ${history.length} data points. Last price: ${price.toFixed(2)}`);
    }
};
