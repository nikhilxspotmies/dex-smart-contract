import express from 'express';
import { register, login, getUserProfile, updateUserProfile, processFirstTrade, deleteAccount } from '../controllers/UserController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', register);
router.post('/signin', login);
router.route('/profile').get(protect, getUserProfile).put(protect, updateUserProfile);
router.delete('/account', protect, deleteAccount);

// Referral endpoint for external services
router.post('/referral/first-trade', processFirstTrade);

export default router;
