import { Router } from 'express';
import {
    submitOrder,
    getPositions,
    getMarkPrice,
    getFundingRate,
    deposit,
    withdraw,
    closePosition,
    adminSetPrice,
    adminUpdateFunding,
} from '../controllers/perpetual.controller.js';

const router = Router();

// Public endpoints
router.post('/orders', submitOrder);
router.get('/positions/:address', getPositions);
router.get('/mark-price', getMarkPrice);
router.get('/funding-rate', getFundingRate);
router.post('/deposit', deposit);
router.post('/withdraw', withdraw);
router.post('/close-position', closePosition);

// Admin endpoints
router.post('/admin/set-price', adminSetPrice);
router.post('/admin/update-funding', adminUpdateFunding);

export default router;

