import express from 'express';
import { recordSwap, getSwapsByUser } from '../controllers/SwapController.js';

const router = express.Router();

router.post('/', recordSwap);
router.get('/:address', getSwapsByUser);

export default router;
