import express from 'express';
import cors from 'cors';
import tradeRoutes from './routes/tradeRoutes.js';
import listingRoutes from './routes/listingRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/trade', tradeRoutes);
app.use('/api/listing', listingRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

export default app;
