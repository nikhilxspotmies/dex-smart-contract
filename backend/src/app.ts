import express from 'express';
import cors from 'cors';
import tradeRoutes from './routes/tradeRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import swapRoutes from './routes/swapRoutes.js';
import perpTradeRoutes from './routes/perpTradeRoutes.js';
import whaleRoutes from './routes/whaleRoutes.js';
import kycRoutes from './routes/kycRoutes.js';

const app = express();

// Enhanced CORS configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

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
