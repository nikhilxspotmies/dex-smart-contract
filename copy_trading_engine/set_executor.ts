import { ethers } from "ethers";
import dotenv from "dotenv";
import { FACTORY_ADDRESS, FACTORY_ABI } from "./src/config/contracts.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function setExecutor() {
    console.log("--- Setting Engine as Executor ---");

    if (!PRIVATE_KEY) {
        console.error("❌ PRIVATE_KEY missing in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`Wallet Address (Owner): ${wallet.address}`);

    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    try {
        const vault1Address = await (factory as any).allVaults(1);
        console.log(`Vault 1 Address: ${vault1Address}`);

        const vaultAbi = [
            "function setExecutor(address _executor) external",
            "function executor() view returns (address)",
            "function owner() view returns (address)"
        ];
        const vault1 = new ethers.Contract(vault1Address, vaultAbi, wallet);

        const currentExecutor = await (vault1 as any).executor();
        console.log(`Current Executor: ${currentExecutor}`);

        if (currentExecutor.toLowerCase() === wallet.address.toLowerCase()) {
            console.log("✅ Engine is already the executor.");
            return;
        }

        console.log(`Setting executor to: ${wallet.address}...`);
        const tx = await (vault1 as any).setExecutor(wallet.address);
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Executor Updated Successfully!");

        const newExecutor = await (vault1 as any).executor();
        console.log(`New Executor: ${newExecutor}`);

    } catch (e: any) {
        console.error("Error setting executor:", e);
    }
}

setExecutor();
