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
    type: String,
    size: String,
    collateral: String,
    pnl: String,
    timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
    walletAddress: String,
    email: String,
    createdAt: Date,
});

const PerpTrade = mongoose.model('PerpTrade', PerpTradeSchema);
const User = mongoose.model('User', UserSchema);

async function diagnose() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        console.log("\n--- Recent Users ---");
        const users = await User.find().sort({ createdAt: -1 }).limit(5);
        users.forEach(u => console.log(`${u.walletAddress} (${u.email}) - ${u.createdAt}`));

        console.log("\n--- Recent Trades ---");
        const trades = await PerpTrade.find().sort({ updatedAt: -1 }).limit(10);
        trades.forEach(t => {
            console.log(`[${t.status}] Pos:${t.positionId} User:${t.walletAddress} PnL:${t.pnl} Updated:${t.updatedAt}`);
        });

        const address = process.argv[2];
        if (address) {
            console.log(`\n--- Trades for ${address} ---`);
            const userTrades = await PerpTrade.find({
                walletAddress: { $regex: new RegExp(`^${address}$`, 'i') }
            }).sort({ updatedAt: -1 });
            console.log(JSON.stringify(userTrades, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

diagnose();
