import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { env } from '../config/env.js';

interface AuthRequest extends Request {
    user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            if (!token) {
                res.status(401).json({ message: 'Not authorized, no token' });
                return;
            }

            const decoded = jwt.verify(token, env.JWT_SECRET) as any;

            req.user = await User.findById(decoded.id).select('-password');

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};
