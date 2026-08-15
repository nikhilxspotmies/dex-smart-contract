import dotenv from 'dotenv';

dotenv.config();

const IS_PROD = process.env.NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET;

// C2: fail fast on missing/weak/placeholder secret.
const WEAK_SECRETS = new Set(['change_me', 'default_secret_key_change_me', 'secret']);
if (!JWT_SECRET || JWT_SECRET.length < 32 || WEAK_SECRETS.has(JWT_SECRET)) {
    throw new Error(
        'JWT_SECRET is missing, too short (<32 chars), or a known placeholder. ' +
        'Set a strong random JWT_SECRET in the environment before starting the server.'
    );
}

// H6: Sumsub webhook HMAC secret — required in production so the webhook can't be spoofed.
const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET || '';
if (IS_PROD && !SUMSUB_WEBHOOK_SECRET) {
    throw new Error('SUMSUB_WEBHOOK_SECRET must be set in production.');
}

// M4: service-to-service auth key for internal-only endpoints — required in production.
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
if (IS_PROD && !INTERNAL_SERVICE_KEY) {
    throw new Error('INTERNAL_SERVICE_KEY must be set in production.');
}

// Session-rotation: CSRF signing secret. Fail fast on missing/weak/placeholder (same rule as JWT).
const CSRF_SECRET = process.env.CSRF_SECRET;
if (!CSRF_SECRET || CSRF_SECRET.length < 32 || WEAK_SECRETS.has(CSRF_SECRET)) {
    throw new Error(
        'CSRF_SECRET is missing, too short (<32 chars), or a known placeholder. ' +
        'Set a strong random CSRF_SECRET in the environment before starting the server.'
    );
}

// CORS allowlist (credentials mode forbids `*`)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// F-07: allowed SIWE domains = CORS hosts + optional SIWE_DOMAIN override(s)
const originHosts = CORS_ORIGINS
    .map((o) => {
        try {
            return new URL(o).host;
        } catch {
            return '';
        }
    })
    .filter(Boolean);
const siweDomainOverrides = (process.env.SIWE_DOMAIN || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
const ALLOWED_SIWE_DOMAINS = Array.from(new Set([...siweDomainOverrides, ...originHosts]));

export const env = {
    JWT_SECRET: JWT_SECRET as string,
    // C2 (legacy): kept for reference; access tokens now use ACCESS_TOKEN_TTL.
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '5d',
    // F-06: session-cookie config.
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_PROD,
    CORS_ORIGINS,
    // F-07: SIWE login config.
    ALLOWED_SIWE_DOMAINS,
    // How long an issued login nonce stays valid (default 5 min).
    NONCE_TTL_MS: Number(process.env.NONCE_TTL_MS) || 5 * 60 * 1000,
    // H6: Sumsub webhook secret.
    SUMSUB_WEBHOOK_SECRET,
    // M4: service-to-service auth key.
    INTERNAL_SERVICE_KEY,

    // ── Refresh-token session rotation ──────────────────────────────────────
    // Short-lived access token (JWT). Keep small — blast radius if leaked.
    // NB: the access COOKIE lives as long as the refresh idle TTL (to carry `fid` for CSRF);
    // only the JWT's own `exp` (this value) gates access.
    ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
    // Refresh token idle lifetime (default 30 days) — the "stay logged in" window.
    REFRESH_IDLE_TTL_MS: Number(process.env.REFRESH_IDLE_TTL_MS) || 30 * 24 * 60 * 60 * 1000,
    // Absolute cap on a session family regardless of activity (default 90 days).
    REFRESH_ABSOLUTE_TTL_MS: Number(process.env.REFRESH_ABSOLUTE_TTL_MS) || 90 * 24 * 60 * 60 * 1000,
    // Grace window in which a just-rotated refresh token is treated as benign (multi-tab/retry).
    REFRESH_GRACE_MS: Number(process.env.REFRESH_GRACE_MS) || 20 * 1000,
    // CSRF double-submit signing secret.
    CSRF_SECRET: CSRF_SECRET as string,
    // Optional cookie Domain (e.g. ".example.com" when frontend+backend share a parent domain).
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
    // Number of trusted proxy hops in front of Express (LB/CDN/ingress). NOT `true`.
    TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS) || 0,
};
