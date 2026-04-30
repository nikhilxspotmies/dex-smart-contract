import express from 'express';
import { storeSwap, getSwapsByUser } from '../controllers/swapController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireKYC } from '../middleware/kycMiddleware.js';

const router = express.Router();

router.post('/', protect, requireKYC, storeSwap);
router.get('/:userAddress', getSwapsByUser);

export default router;
