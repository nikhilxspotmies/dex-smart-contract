import express from 'express';
import { generateToken, handleWebhook } from '../controllers/kycController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   GET /api/kyc/generate-token
 * @desc    Generate Sumsub access token for the logged-in user
 * @access  Private
 */
router.get('/generate-token', protect, generateToken);

/**
 * @route   POST /api/kyc/webhook
 * @desc    Receive verification status updates from Sumsub
 * @access  Public (Sumsub servers)
 */
router.post('/webhook', handleWebhook);

export default router;
