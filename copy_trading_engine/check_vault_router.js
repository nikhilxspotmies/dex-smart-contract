import { ethers } from "ethers";
import dotenv from "dotenv";
import { VAULT_ABI } from "./dist/config/contracts.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const VAULT_ADDRESS = "0x5d27e74382DD41D75B0b4563A8E2D8CD1E0E6e00"; // Vault 1

async function checkRouter() {
    console.log("--- Checking Vault Router Configuration ---");
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // VAULT_ABI only has 'rebalance' usually, need to verify if it includes 'swapRouter' view function
    // The contract has 'address public swapRouter;' so it should generate a getter.
    const abi = [
        "function swapRouter() view returns (address)",
        "function owner() view returns (address)",
        "function executor() view returns (address)"
    ];

    const vault = new ethers.Contract(VAULT_ADDRESS, abi, provider);

    try {
        const router = await vault.swapRouter();
        const owner = await vault.owner();
        const executor = await vault.executor();

        console.log(`Vault Address: ${VAULT_ADDRESS}`);
        console.log(`Vault Owner:   ${owner}`);
        console.log(`Vault Executor:${executor}`);
        console.log(`Vault Router:  ${router}`);

        const ENV_ROUTER = process.env.ROUTER_ADDRESS;
        console.log(`Env Router:    ${ENV_ROUTER}`);

        if (router.toLowerCase() === ENV_ROUTER?.toLowerCase()) {
            console.log("✅ Router Matches .env");
        } else {
            console.warn("⚠️ Router MISMATCH!");
        }

    } catch (e) {
        console.error("Failed to read vault storage:", e);
    }
}

checkRouter();
