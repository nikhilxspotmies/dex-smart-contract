import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const generateToken = (id: string) => {
    return jwt.sign({ id }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
};

export default generateToken;
