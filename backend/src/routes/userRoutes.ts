import { Router } from 'express';
import { signIn, signUp, getUser, getReferralStats } from '../controllers/UserController.js';

const router = Router();

router.post('/signin', signIn);
router.post('/signup', signUp);
router.get('/', getUser);
router.get('/profile', getUser);  // Alias for frontend compatibility
router.get('/referral-stats', getReferralStats);

export default router;
