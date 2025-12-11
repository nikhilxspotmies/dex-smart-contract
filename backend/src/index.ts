import app from './app.js';
import connectDB from './config/db.js';
import BlockchainService from './services/BlockchainService.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 8080;

// Connect to Database
connectDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


