import express from 'express';
import { releaseFunds, getTradesByUser, createTrade, reportNotReceived } from '../controllers/TradeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireKYC } from '../middleware/kycMiddleware.js';

const router = express.Router();

router.post('/create', protect, requireKYC, createTrade);
router.post('/release', protect, requireKYC, releaseFunds); 
router.post('/report-not-received', protect, requireKYC, reportNotReceived);
router.get('/user/:address', getTradesByUser)

export default router;
