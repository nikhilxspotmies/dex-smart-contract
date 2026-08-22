import express from 'express';
import { TRADERS } from '../constants/whales.js';
import { whaleStatsService } from '../services/WhaleStatsService.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const traders = await Promise.all(TRADERS.map(async (trader) => {
            const [followers, { roiPct, pnlUsd, trackingSince }] = await Promise.all([
                whaleStatsService.getFollowerCount(trader.address),
                whaleStatsService.getRoiAndPnl(trader.address),
            ]);

            return {
                ...trader,
                followers,
                roiPct,
                pnlUsd,
                winRate: null, // not computable without per-trade history — see plan doc
                trackingSince,
            };
        }));

        res.json(traders);
    } catch (error) {
        console.error('Failed to compute whale stats:', error);
        res.status(500).json({ error: 'Failed to load traders' });
    }
});

export default router;
