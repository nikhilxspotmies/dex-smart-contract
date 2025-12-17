import express from 'express';
import { releaseFunds, getTradesByUser } from '../controllers/TradeController.js';

const router = express.Router();

router.post('/release', releaseFunds);
router.get('/user/:address', getTradesByUser)

export default router;
