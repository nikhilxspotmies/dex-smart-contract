import express from 'express';
import { createTrade, getTradesByAddress } from '../controllers/PerpTradeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireKYC } from '../middleware/kycMiddleware.js';

const router = express.Router();

router.post('/trade', protect, requireKYC, createTrade);
router.get('/trades/:walletAddress', getTradesByAddress);

export default router;
