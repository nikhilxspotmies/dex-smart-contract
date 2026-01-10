import express from 'express';
import cors from 'cors';
import tradeRoutes from './routes/tradeRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import userRoutes from './routes/userRoutes.js';
import swapRoutes from './routes/swapRoutes.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/trade', tradeRoutes);
app.use('/api/listing', listingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/swap', swapRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

export default app;
