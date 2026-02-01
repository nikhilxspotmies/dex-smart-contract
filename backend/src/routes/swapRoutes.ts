import express from 'express';
import { storeSwap, getSwapsByUser } from '../controllers/swapController.js';

const router = express.Router();

router.post('/', storeSwap);
router.get('/:userAddress', getSwapsByUser);

export default router;
