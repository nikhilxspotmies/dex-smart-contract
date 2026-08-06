import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ACCESS_COOKIE } from '../utils/authCookie.js';

interface AuthRequest extends Request {
    user?: any;
    familyId?: string;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // F-06: access cookie first, Bearer header as fallback
    let token: string | undefined = req.cookies?.[ACCESS_COOKIE];

    if (
        !token &&
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
        return;
    }

    try {
        // small clock tolerance for multi-instance skew
        const decoded = jwt.verify(token, env.JWT_SECRET, { clockTolerance: 5 }) as any;

        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) {
            res.status(401).json({ message: 'Not authorized, user not found' });
            return;
        }

        req.familyId = decoded.fid;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};
