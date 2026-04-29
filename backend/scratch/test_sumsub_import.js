import { sdk } from 'sumsub-node-sdk';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

console.log('Testing Sumsub SDK import...');
try {
    const s = sdk({
        baseURL: 'https://api.sumsub.com',
        appToken: 'test',
        secretKey: 'test'
    });
    console.log('SDK initialized successfully:', !!s);
    process.exit(0);
} catch (e) {
    console.error('SDK initialization failed:', e);
    process.exit(1);
}
