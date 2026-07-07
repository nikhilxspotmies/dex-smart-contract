import crypto from 'crypto';
import { env } from '../config/env.js';

// Signed double-submit CSRF token (OWASP-recommended variant).
// Format: `${fid}.${nonce}.${hmac}` where hmac = HMAC-SHA256(CSRF_SECRET, `${fid}:${nonce}`).
// Binding the HMAC to the session family id (fid) means a token planted by a compromised
// sibling subdomain (plain double-submit weakness) won't validate against the victim's session.

const sign = (fid: string, nonce: string): string =>
    crypto.createHmac('sha256', env.CSRF_SECRET).update(`${fid}:${nonce}`).digest('hex');

export const issueCsrfToken = (fid: string): string => {
    const nonce = crypto.randomBytes(16).toString('hex');
    return `${fid}.${nonce}.${sign(fid, nonce)}`;
};

// Valid only if the HMAC verifies AND the embedded fid matches the caller's session fid.
export const verifyCsrfToken = (token: string | undefined, sessionFid: string | undefined): boolean => {
    if (!token || !sessionFid) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [fid, nonce, mac] = parts;
    if (!fid || !nonce || !mac) return false;
    if (fid !== sessionFid) return false;
    const expected = sign(fid, nonce);
    // constant-time compare (equal length by construction of hex digests)
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};
