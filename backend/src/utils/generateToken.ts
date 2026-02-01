import jwt from 'jsonwebtoken';

const generateToken = (id: string) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'default_secret_key_change_me', {
        expiresIn: '30d',
    });
};

export default generateToken;
