import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import orderRoutes from './routes/order.routes.js';
import { MatchingEngine } from './services/matching.service.js';

const app = express();
const port = process.env.PORT || 3001;

const matchingEngine = new MatchingEngine();

console.log('LIMIT_ORDER_ADDRESS:', process.env.LIMIT_ORDER_ADDRESS);
console.log('PORT:', process.env.PORT);

// Configuration
app.set('chainId', process.env.CHAIN_ID || 31337);
app.set('protocolAddress', process.env.LIMIT_ORDER_ADDRESS);

app.use(cors());
app.use(express.json());

// Routes
app.use('/orders', orderRoutes);
app.use('/orderbook', orderRoutes); // Both point to the same router for simplicity or specific paths

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        chainId: app.get('chainId'),
        protocolAddress: app.get('protocolAddress')
    });
});

app.listen(port, () => {
    console.log(`Limit Order Backend running on port ${port}`);
    matchingEngine.start();
});