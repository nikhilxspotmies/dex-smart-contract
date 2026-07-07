import express from 'express';
import rateLimit from 'express-rate-limit';
import {
    register,
    login,
    logout,
    logoutAll,
    refresh,
    getNonce,
    getUserProfile,
    updateUserProfile,
    processFirstTrade,
    deleteAccount,
} from '../controllers/UserController.js';
import { protect } from '../middleware/authMiddleware.js';
import { internalAuth } from '../middleware/internalAuthMiddleware.js';
import { csrfProtection } from '../middleware/csrfMiddleware.js';

const router = express.Router();

// Throttle credential + rotation endpoints (per-IP; needs `trust proxy` set — see app.ts).
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const refreshLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.post('/nonce', getNonce); // F-07: SIWE nonce (no session yet → CSRF-exempt)
router.post('/signup', authLimiter, register); // no session yet → CSRF-exempt
router.post('/signin', authLimiter, login); // no session yet → CSRF-exempt
router.post('/refresh', refreshLimiter, csrfProtection, refresh);
router.post('/logout', csrfProtection, logout);
router.post('/logout-all', protect, csrfProtection, logoutAll);
router.route('/profile')
    .get(protect, getUserProfile)
    .put(protect, csrfProtection, updateUserProfile);
router.delete('/account', protect, csrfProtection, deleteAccount);

// M4: internal service endpoint — requires X-Internal-Key header (service-to-service, no CSRF)
router.post('/referral/first-trade', internalAuth, processFirstTrade);

export default router;
