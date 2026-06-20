import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import tradeRoutes from './routes/tradeRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import swapRoutes from './routes/swapRoutes.js';
import perpTradeRoutes from './routes/perpTradeRoutes.js';
import whaleRoutes from './routes/whaleRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import { env } from './config/env.js';

const app = express();

// F-06: credentialed CORS reflecting the allowlist (no Origin = server-to-server, allowed)
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use(cookieParser());

app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use('/api/trade', tradeRoutes);
app.use('/api/listing', listingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/swap', swapRoutes);
app.use('/api/perp', perpTradeRoutes);
app.use('/api/whales', whaleRoutes);
app.use('/api/kyc', kycRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

export default app;
