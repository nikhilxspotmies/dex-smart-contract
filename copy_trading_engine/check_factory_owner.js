import { ethers } from "ethers";
import dotenv from "dotenv";
import { FACTORY_ABI } from "./dist/config/contracts.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0xEca72d3FbC8AA012aC563ff30499CD796f005933";
const ENGINE_WALLET = "0x440AA0257b029E4A467B9Cf996cf523011Eb5ffA";

async function checkOwner() {
    console.log("--- Checking Factory Ownership ---");
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const abi = [
        "function owner() view returns (address)",
        "function swapRouter() view returns (address)"
    ];

    const factory = new ethers.Contract(FACTORY_ADDRESS, abi, provider);

    try {
        const owner = await factory.owner();
        const router = await factory.swapRouter();

        console.log(`Factory: ${FACTORY_ADDRESS}`);
        console.log(`Owner:   ${owner}`);
        console.log(`Router:  ${router}`);
        console.log(`Engine:  ${ENGINE_WALLET}`);

        if (owner.toLowerCase() === ENGINE_WALLET.toLowerCase()) {
            console.log("✅ Engine IS Owner");
        } else {
            console.log("❌ Engine is NOT Owner");
        }

    } catch (e) {
        console.error("Failed to read factory:", e);
    }
}

checkOwner();
