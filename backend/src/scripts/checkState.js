
import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { defineChain } from "thirdweb";
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const CLIENT_ID = process.env.THIRDWEB_CLIENT_ID || "8ca215ef540ad64e09539db92ef92e91"; // Fallback to what was in .env
const SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;

const client = createThirdwebClient({
    clientId: CLIENT_ID,
    secretKey: SECRET_KEY
});

// Sepolia
const chain = defineChain(11155111);

const MARKET_ADDRESS = process.env.PERP_MARKET_ADDRESS || process.env.VITE_PERP_MARKET_ADDRESS;

if (!MARKET_ADDRESS) {
    console.error("No Market Address found");
    process.exit(1);
}

const contract = getContract({
    client,
    chain,
    address: MARKET_ADDRESS
});

async function main() {
    console.log("Checking Market State (JS) at:", MARKET_ADDRESS);

    try {
        const nextId = await readContract({
            contract,
            method: "function nextPositionId() view returns (uint256)",
            params: []
        });
        console.log("Current nextPositionId:", nextId.toString());

        const lastId = Number(nextId) - 1;
        if (lastId > 0) {
            console.log(`Checking Position ${lastId}...`);
            const pos = await readContract({
                contract,
                method: "function positions(uint256) view returns (uint256 size, uint256 collateral, uint256 entryPrice, int256 fundingEntry, bool isLong)",
                params: [BigInt(lastId)]
            });

            const posFormatted = {
                size: pos[0].toString(),
                collateral: pos[1].toString(),
                entryPrice: pos[2].toString(),
                fundingEntry: pos[3].toString(),
                isLong: pos[4]
            };
            console.log(`Position ${lastId} details:`, JSON.stringify(posFormatted, null, 2));
        } else {
            console.log("No positions created yet.");
        }

    } catch (e) {
        console.error("Error fetching state:", e);
    }
}

main();
