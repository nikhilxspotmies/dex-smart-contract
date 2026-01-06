import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import perpetualRoutes from './routes/perpetual.routes.js';

const app = express();
const port = process.env.PORT || 3002;

console.log('PERPETUAL_CONTRACT_ADDRESS:', process.env.PERPETUAL_CONTRACT_ADDRESS);
console.log('PORT:', process.env.PORT);

// Configuration
app.set('chainId', process.env.CHAIN_ID || 31337);
app.set('perpetualAddress', process.env.PERPETUAL_CONTRACT_ADDRESS);
app.set('oracleAddress', process.env.MOCK_ORACLE_ADDRESS);

app.use(cors());
app.use(express.json());

// Routes
app.use('/', perpetualRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        chainId: app.get('chainId'),
        perpetualAddress: app.get('perpetualAddress'),
        oracleAddress: app.get('oracleAddress')
    });
});

app.listen(port, () => {
    console.log(`Perpetual Backend running on port ${port}`);
});

