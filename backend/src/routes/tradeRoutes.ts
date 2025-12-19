import express from 'express';
import { releaseFunds, getTradesByUser, createTrade } from '../controllers/TradeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', createTrade);
router.post('/release', protect, releaseFunds);
router.get('/user/:address', getTradesByUser)

export default router;
