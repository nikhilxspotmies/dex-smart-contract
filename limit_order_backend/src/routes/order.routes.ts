import { Router } from 'express';
import { createOrder, getOrderbook, getLastPrice, deleteOrder, getPriceHistory } from '../controllers/orders.controller.js';

const router = Router();

router.post('/', createOrder);
router.delete('/', deleteOrder);
router.get('/', getOrderbook);
router.get('/last-price', getLastPrice);
router.get('/history', getPriceHistory);

export default router;
