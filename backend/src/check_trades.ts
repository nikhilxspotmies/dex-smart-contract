import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || "";

const PerpTradeSchema = new mongoose.Schema({
    walletAddress: String,
    positionId: String,
    status: String,
    size: String,
    collateral: String,
    pnl: String,
}, { timestamps: true });

const PerpTrade = mongoose.model('PerpTrade', PerpTradeSchema);

async function checkTrades() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const walletAddress = process.argv[2];
        if (!walletAddress) {
            console.log("Please provide a wallet address as argument");
            process.exit(1);
        }

        const trades = await PerpTrade.find({ 
            walletAddress: { $regex: new RegExp(`^${walletAddress}$`, 'i') } 
        });

        console.log(`Found ${trades.length} trades for ${walletAddress}:`);
        console.log(JSON.stringify(trades, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkTrades();
