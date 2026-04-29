import type { Response, NextFunction } from 'express';

/**
 * Middleware to ensure the user has completed KYC verification.
 * Should be used AFTER protect (authMiddleware).
 */
export const requireKYC = async (req: any, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
        res.status(401).json({ message: 'Unauthorized. Please login first.' });
        return;
    }

    // Check if user is verified
    // Statuses: 'NONE', 'PENDING', 'VERIFIED', 'REJECTED'
    if (user.kycStatus !== 'VERIFIED') {
        res.status(403).json({ 
            message: 'Identity verification (KYC) required to access this feature.',
            kycStatus: user.kycStatus 
        });
        return;
    }

    next();
};
