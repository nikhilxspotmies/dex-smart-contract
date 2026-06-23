import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

// M4: service-to-service auth guard for internal endpoints.
// Callers must send X-Internal-Key matching INTERNAL_SERVICE_KEY env var.
export const internalAuth = (req: Request, res: Response, next: NextFunction): void => {
    const key = req.headers['x-internal-key'];
    if (!env.INTERNAL_SERVICE_KEY || key !== env.INTERNAL_SERVICE_KEY) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    next();
};
