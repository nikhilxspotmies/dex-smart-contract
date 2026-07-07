import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Short-lived access token. Payload carries the user id and the session family id (fid)
// so logout/revocation can target the exact session without needing the refresh cookie.
export const signAccessToken = (userId: string, familyId: string) => {
    return jwt.sign({ id: userId, fid: familyId }, env.JWT_SECRET, {
        expiresIn: env.ACCESS_TOKEN_TTL,
    } as jwt.SignOptions);
};

export default signAccessToken;
