import express from 'express';
import { register, login, getUserProfile } from '../controllers/UserController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', register);
router.post('/signin', login);
router.get('/profile', protect, getUserProfile);

export default router;
