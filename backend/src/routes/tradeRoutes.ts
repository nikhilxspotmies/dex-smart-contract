import express from 'express';
import { releaseFunds, getTradesByUser, createTrade, reportNotReceived } from '../controllers/TradeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireKYC } from '../middleware/kycMiddleware.js';
import { csrfProtection } from '../middleware/csrfMiddleware.js';

const router = express.Router();

router.post('/create', protect, csrfProtection, requireKYC, createTrade);
router.post('/release', protect, csrfProtection, requireKYC, releaseFunds);
router.post('/report-not-received', protect, csrfProtection, requireKYC, reportNotReceived);
router.get('/user/:address', protect, getTradesByUser)

export default router;
