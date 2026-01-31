import express from 'express';
import Candle from '../models/Candle.js';

const router = express.Router();

// GET /api/chart/history?symbol=ETH&resolution=1m&from=123123&to=123123
router.get('/history', async (req, res) => {
    try {
        const { symbol, resolution, from, to } = req.query;

        console.log(`Fetching chart history for ${symbol} ${resolution}`);

        if (!symbol || !resolution) {
            return res.status(400).json({ error: 'Missing symbol or resolution' });
        }

        // Map resolution from frontend (TradingView often uses '1', '5', 'D') to backend '1m', '5m'
        let timeframe = String(resolution);
        if (timeframe === '1') timeframe = '1m';
        if (timeframe === '5') timeframe = '5m';
        if (timeframe === '30') timeframe = '30m';
        if (timeframe === '120' || timeframe === '2H') timeframe = '2h';
        if (timeframe === '1D' || timeframe === 'D') timeframe = '1d';

        const query: any = {
            symbol: String(symbol),
            timeframe: timeframe
        };

        if (from) {
            query.time = { ...query.time, $gte: Number(from) };
        }
        if (to) {
            query.time = { ...query.time || {}, $lte: Number(to) };
        }

        const candles = await Candle.find(query).sort({ time: 1 }).lean();

        // Format for Lightweight Charts: { time: 123123, open: 1, high: 2, low: 1, close: 2 }
        const formattedCandles = candles.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        res.json(formattedCandles);

    } catch (error) {
        console.error('Error fetching chart history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
