import { Router } from 'express';
import {
    getMarkets,
    submitOrder,
    getPositions,
    getMarkPrice,
    getFundingRate,
    getOrderbook,
    deposit,
    withdraw,
    closePosition,
    adminSetPrice,
    adminUpdateFunding,
} from '../controllers/perpetual.controller.js';

const router = Router();

// Public endpoints
router.get('/markets', getMarkets); // List all available markets
router.post('/orders', submitOrder); // Submit order (market in body)
router.get('/orderbook/:market', getOrderbook); // Get orderbook with market
router.get('/orderbook', getOrderbook); // Get orderbook (uses default market)
router.get('/positions/:address/:market', getPositions); // Get position with market
router.get('/positions/:address', getPositions); // Get position (uses default market)
router.get('/mark-price/:market', getMarkPrice); // Get price with market
router.get('/mark-price', getMarkPrice); // Get price (uses default market)
router.get('/funding-rate/:market', getFundingRate); // Get funding rate with market
router.get('/funding-rate', getFundingRate); // Get funding rate (uses default market)
router.post('/deposit', deposit);
router.post('/withdraw', withdraw);
router.post('/close-position', closePosition); // Close position (market in body)

// Admin endpoints
router.post('/admin/set-price', adminSetPrice); // Set price (market in body)
router.post('/admin/update-funding', adminUpdateFunding); // Update funding (market in body)

export default router;

