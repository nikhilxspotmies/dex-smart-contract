import { Router } from 'express';
import { createOrder, getOrderbook } from '../controllers/orders.controller.js';

const router = Router();

router.post('/', createOrder);
router.get('/', getOrderbook);

export default router;
