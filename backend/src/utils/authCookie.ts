import type { Response, CookieOptions } from 'express';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'token';

// httpOnly so JS/XSS can't read it; SameSite=None+Secure in prod (cross-site), Lax in dev.
const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: env.IS_PROD,
    sameSite: env.IS_PROD ? 'none' : 'lax',
    path: '/',
    maxAge: env.COOKIE_MAX_AGE_MS,
});

export const setAuthCookie = (res: Response, token: string): void => {
    res.cookie(AUTH_COOKIE, token, cookieOptions());
};

export const clearAuthCookie = (res: Response): void => {
    // same flags (minus maxAge) so the cookie matches and clears
    const { maxAge, ...opts } = cookieOptions();
    res.clearCookie(AUTH_COOKIE, opts);
};
