import { ethers } from "ethers";
import dotenv from "dotenv";
import { ERC20_ABI, ROUTER_ADDRESS, FACTORY_ADDRESS, FACTORY_ABI, VAULT_ABI, WHITELIST } from "./dist/config/contracts.js";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const WHALE_ADDRESS = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848";

async function checkStatus() {
    console.log(`Connecting to RPC: ${RPC_URL}`);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // 1. Get Vault 1
    // Note: contracts.js might not export FACTORY_ADDRESS properly if .env wasn't loaded at import time?
    // Let's verify.
    console.log("Factory Address:", FACTORY_ADDRESS);

    // If FACTORY_ADDRESS is 0x0... checks will fail.
    // If so, we might need to rely on process.env here.

    // Manual fallback for factory if import failed to read env
    const factoryAddr = FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000" ? FACTORY_ADDRESS : (process.env.FACTORY_ADDRESS || "0xEca72d3FbC8AA012aC563ff30499CD796f005933");

    const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);

    try {
        const vaultAddress = await factory.allVaults(1);
        console.log(`\nVault 1: ${vaultAddress}`);

        const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
        const targetWhale = await vault.targetWhale();
        console.log(`Target Whale: ${targetWhale}`);

        // 2. Check Balances
        // Use addresses from WHITELIST or env
        const usdcAddr = WHITELIST.USDC.address;
        const ethAddr = WHITELIST.ETH.address;

        console.log(`USDC: ${usdcAddr}`);
        console.log(`ETH:  ${ethAddr}`);

        const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, provider);
        const eth = new ethers.Contract(ethAddr, ERC20_ABI, provider);

        const vaultUSDC = await usdc.balanceOf(vaultAddress);
        const vaultETH = await eth.balanceOf(vaultAddress);

        const whaleUSDC = await usdc.balanceOf(WHALE_ADDRESS);
        const whaleETH = await eth.balanceOf(WHALE_ADDRESS);

        console.log("\n--- Balances ---");
        console.log(`Vault USDC: ${ethers.formatUnits(vaultUSDC, 18)}`);
        console.log(`Vault ETH:  ${ethers.formatUnits(vaultETH, 18)}`);
        console.log(`Whale USDC: ${ethers.formatUnits(whaleUSDC, 18)}`);
        console.log(`Whale ETH:  ${ethers.formatUnits(whaleETH, 18)}`);

        // 3. Check Liquidity
        console.log("\n--- Custom DEX Liquidity ---");
        const DEX_FACTORY = "0xecb64015331902795323b56A04710e2d6cC3A21d";
        const DEX_FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
        // const PAIR_ABI = ["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"];

        const dexFactory = new ethers.Contract(DEX_FACTORY, DEX_FACTORY_ABI, provider);
        const pairAddress = await dexFactory.getPair(usdcAddr, ethAddr);
        console.log(`Pair Address (USDC/ETH): ${pairAddress}`);

        if (pairAddress === ethers.ZeroAddress) {
            console.log("❌ Pair does not exist!");
        } else {
            console.log(`Checking balances of Pair: ${pairAddress}`);
            const balanceUSDC = await usdc.balanceOf(pairAddress);
            const balanceETH = await eth.balanceOf(pairAddress);

            console.log(`Pair USDC Balance: ${ethers.formatUnits(balanceUSDC, 18)}`);
            console.log(`Pair ETH Balance:  ${ethers.formatUnits(balanceETH, 18)}`);

            if (balanceUSDC > 0n) {
                const price = Number(ethers.formatUnits(balanceETH, 18)) / Number(ethers.formatUnits(balanceUSDC, 18));
                console.log(`Pool Price (implied): 1 USDC = ${price} ETH`);
            } else {
                console.log("⚠️ Pair has 0 USDC!");
            }
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

checkStatus();
