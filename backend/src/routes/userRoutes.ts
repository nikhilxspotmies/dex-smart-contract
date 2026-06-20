import express from 'express';
import { register, login, logout, getNonce, getUserProfile, updateUserProfile, processFirstTrade, deleteAccount } from '../controllers/UserController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/nonce', getNonce); // F-07: SIWE nonce
router.post('/signup', register);
router.post('/signin', login);
router.post('/logout', logout);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.delete('/account', protect, deleteAccount);

// Referral endpoint for external services
router.post('/referral/first-trade', processFirstTrade);

export default router;
