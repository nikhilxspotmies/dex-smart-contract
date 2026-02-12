import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const VAULT_ABI = [
    "function executor() view returns (address)",
    "function owner() view returns (address)"
];

const FAILING_VAULT = "0xabD664c377BE8fb158ABd853F322822b544BC2d3"; // From logs

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);

    console.log("--- Debug Executor ---");
    console.log("Engine Wallet Address:", wallet.address);

    console.log(`\nChecking Vault: ${FAILING_VAULT}`);
    try {
        const vault = new ethers.Contract(FAILING_VAULT, VAULT_ABI, provider);
        const executor = await vault.executor();
        const owner = await vault.owner();

        console.log("Vault Owner:", owner);
        console.log("Vault Authorized Executor:", executor);

        if (executor.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ Engine IS the executor.");
        } else {
            console.log("❌ Engine is NOT the executor.");
            console.log("ACTION REQUIRED: Owner must call setExecutor(" + wallet.address + ")");
        }
    } catch (e) {
        console.error("Error fetching vault data:", e);
    }
}

main();
