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

// CORS allowlist (credentials mode forbids `*`)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// F-07: allowed SIWE domains = CORS hosts + optional SIWE_DOMAIN override
const originHosts = CORS_ORIGINS
    .map((o) => {
        try {
            return new URL(o).host;
        } catch {
            return '';
        }
    })
    .filter(Boolean);
const ALLOWED_SIWE_DOMAINS = Array.from(
    new Set([...(process.env.SIWE_DOMAIN ? [process.env.SIWE_DOMAIN.trim()] : []), ...originHosts])
);

export const env = {
    JWT_SECRET: JWT_SECRET as string,
    // C2: 5-day token expiry.
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '5d',
    // F-06: session-cookie config.
    NODE_ENV: process.env.NODE_ENV || 'development',
    IS_PROD,
    CORS_ORIGINS,
    // Cookie maxAge in ms — mirror JWT_EXPIRES_IN (~5 days).
    COOKIE_MAX_AGE_MS: Number(process.env.COOKIE_MAX_AGE_MS) || 5 * 24 * 60 * 60 * 1000,
    // F-07: SIWE login config.
    ALLOWED_SIWE_DOMAINS,
    // How long an issued login nonce stays valid (default 5 min).
    NONCE_TTL_MS: Number(process.env.NONCE_TTL_MS) || 5 * 60 * 1000,
    // H6: Sumsub webhook secret.
    SUMSUB_WEBHOOK_SECRET,
    // M4: service-to-service auth key.
    INTERNAL_SERVICE_KEY,
};
