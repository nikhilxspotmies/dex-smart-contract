import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../utils/authCookie.js';
import { verifyCsrfToken } from '../utils/csrf.js';

// Methods that mutate state must carry a valid CSRF token; safe methods are exempt.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Resolve the session family id (fid) from the access token cookie/header, WITHOUT
// requiring a fully-valid session — CSRF check runs even if the access token just expired,
// so we read fid with the signature verified but expiry ignored.
const readFid = (req: Request): string | undefined => {
    let token: string | undefined = (req as any).cookies?.[ACCESS_COOKIE];
    if (!token && req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return undefined;
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as any;
        return decoded?.fid;
    } catch {
        return undefined;
    }
};

// Double-submit: header X-CSRF-Token must equal the csrf cookie AND validate (HMAC bound to fid).
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    const header = req.headers['x-csrf-token'];
    const cookie = (req as any).cookies?.[CSRF_COOKIE];
    const headerToken = Array.isArray(header) ? header[0] : header;

    if (!headerToken || !cookie || headerToken !== cookie) {
        res.status(403).json({ message: 'CSRF validation failed' });
        return;
    }

    if (!verifyCsrfToken(headerToken, readFid(req))) {
        res.status(403).json({ message: 'CSRF validation failed' });
        return;
    }

    next();
};
