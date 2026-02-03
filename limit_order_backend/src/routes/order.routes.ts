import { Router } from 'express';
import { createOrder, getOrderbook, getLastPrice, deleteOrder, getPriceHistory, getDebugOrders, getUserOrders } from '../controllers/orders.controller.js';

const router = Router();

router.post('/', createOrder);
router.delete('/', deleteOrder);
router.get('/', getOrderbook);
router.get('/last-price', getLastPrice);
router.get('/history', getPriceHistory);
router.get('/debug', getDebugOrders);
router.get('/user/:address', getUserOrders);

export default router;
