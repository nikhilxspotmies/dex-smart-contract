import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

// C2: fail fast on missing/weak/placeholder secret.
const WEAK_SECRETS = new Set(['change_me', 'default_secret_key_change_me', 'secret']);
if (!JWT_SECRET || JWT_SECRET.length < 32 || WEAK_SECRETS.has(JWT_SECRET)) {
    throw new Error(
        'JWT_SECRET is missing, too short (<32 chars), or a known placeholder. ' +
        'Set a strong random JWT_SECRET in the environment before starting the server.'
    );
}

export const env = {
    JWT_SECRET: JWT_SECRET as string,
    // C2: 5-day token expiry.
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '5d',
};
