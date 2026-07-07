import type { Response, CookieOptions } from 'express';
import { env } from '../config/env.js';

// Cookie names. ACCESS_COOKIE replaces the legacy 'token' cookie.
export const ACCESS_COOKIE = 'access';
export const REFRESH_COOKIE = 'refresh';
export const CSRF_COOKIE = 'csrf';

// Refresh cookie is scoped to /api/user so it reaches BOTH /refresh and /logout
// (and no other route), keeping its exposure narrow while allowing server-side revocation.
const REFRESH_PATH = '/api/user';

// Shared flags: HttpOnly by default; SameSite=None+Secure in prod (cross-site), Lax in dev.
const base = (): CookieOptions => ({
    httpOnly: true,
    secure: env.IS_PROD,
    sameSite: env.IS_PROD ? 'none' : 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/',
});

export const setAccessCookie = (res: Response, token: string): void => {
    // Cookie lifetime tracks the SESSION (refresh idle TTL), NOT the 15-min JWT expiry.
    // The JWT's own `exp` gates access (protect re-verifies it); keeping the cookie alive
    // lets the CSRF middleware still read `fid` from an expired-but-present access token
    // when /refresh is called (the token has expired — that's why we're refreshing).
    res.cookie(ACCESS_COOKIE, token, { ...base(), maxAge: env.REFRESH_IDLE_TTL_MS });
};

export const setRefreshCookie = (res: Response, raw: string): void => {
    res.cookie(REFRESH_COOKIE, raw, { ...base(), path: REFRESH_PATH, maxAge: env.REFRESH_IDLE_TTL_MS });
};

// CSRF cookie is deliberately readable by JS (double-submit) → not HttpOnly.
export const setCsrfCookie = (res: Response, token: string): void => {
    res.cookie(CSRF_COOKIE, token, { ...base(), httpOnly: false, maxAge: env.REFRESH_IDLE_TTL_MS });
};

export const clearAuthCookies = (res: Response): void => {
    const b = base();
    res.clearCookie(ACCESS_COOKIE, { ...b, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...b, path: REFRESH_PATH });
    res.clearCookie(CSRF_COOKIE, { ...b, httpOnly: false, path: '/' });
};
