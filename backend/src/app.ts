import express from 'express';
import cors from 'cors';
import tradeRoutes from './routes/tradeRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/trade', tradeRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

export default app;
