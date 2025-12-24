import express from 'express';
import { releaseFunds, getTradesByUser, createTrade, reportNotReceived } from '../controllers/TradeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', createTrade);
router.post('/release', protect, releaseFunds); //this should be more protected in future....
router.post('/report-not-received', protect, reportNotReceived);
router.get('/user/:address', getTradesByUser)

export default router;
