import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || "";

const PerpTradeSchema = new mongoose.Schema({}, { strict: false, collection: 'perptrades' });
const PerpTrade = mongoose.model('PerpTrade', PerpTradeSchema);

async function count() {
    try {
        await mongoose.connect(MONGO_URI);
        const count = await PerpTrade.countDocuments();
        console.log(`Total PerpTrades: ${count}`);

        // List collections to verify name
        if (mongoose.connection.db) {
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log("Collections:", collections.map(c => c.name));
        } else {
            console.warn("Mongoose connection DB is undefined.");
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

count();
