import { ethers } from "ethers";
import dotenv from "dotenv";
import { FACTORY_ADDRESS, FACTORY_ABI } from "./src/config/contracts.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function checkPermissions() {
    console.log("--- Checking Engine Permissions ---");

    // 1. Check Engine Wallet
    if (!PRIVATE_KEY) {
        console.error("❌ PRIVATE_KEY missing in .env");
        return;
    }
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    console.log(`Engine Wallet Address: ${wallet.address}`);

    // 2. Check Vault 1 Executor
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    try {
        const vault1Address = await (factory as any).allVaults(1);
        console.log(`Vault 1 Address: ${vault1Address}`);

        const vaultAbi = ["function executor() view returns (address)", "function owner() view returns (address)"];
        const vault1 = new ethers.Contract(vault1Address, vaultAbi, provider);

        const executor = await (vault1 as any).executor();
        const owner = await (vault1 as any).owner();

        console.log(`- Owner: ${owner}`);
        console.log(`- Executor (Authorized): ${executor}`);

        if (executor.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ Engine IS the executor!");
        } else {
            console.log("❌ Engine is NOT the executor.");
            console.log(`   Expected: ${executor}`);
            console.log(`   Actual:   ${wallet.address}`);
        }

    } catch (e: any) {
        console.error("Error checking vault:", e);
    }
}

checkPermissions();
