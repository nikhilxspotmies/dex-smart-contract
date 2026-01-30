import mongoose from 'mongoose';

const swapSchema = new mongoose.Schema({
    userAddress: {
        type: String,
        required: true,
        lowercase: true
    },
    tokenIn: {
        type: String,
        required: true
    },
    tokenOut: {
        type: String,
        required: true
    },
    amountIn: {
        type: String,
        required: true
    },
    amountOut: {
        type: String,
        required: true
    },
    txHash: {
        type: String,
        required: true,
        unique: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const Swap = mongoose.model('Swap', swapSchema);
export default Swap;
