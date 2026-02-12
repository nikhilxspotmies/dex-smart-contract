import express from 'express';
import cors from 'cors';
import tradeRoutes from './routes/tradeRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import swapRoutes from './routes/swapRoutes.js';
import perpTradeRoutes from './routes/perpTradeRoutes.js';

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

app.use(express.json());

app.use('/api/trade', tradeRoutes);
app.use('/api/listing', listingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/swap', swapRoutes);
app.use('/api/perp', perpTradeRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

export default app;
