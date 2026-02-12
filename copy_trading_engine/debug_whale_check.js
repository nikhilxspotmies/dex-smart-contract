import { ethers } from "ethers";
import dotenv from "dotenv";
import { ERC20_ABI, ROUTER_ADDRESS, ROUTER_ABI, QUOTE_TOKEN_ADDRESS, QUOTE_TOKEN_DECIMALS, WHITELIST, FACTORY_ADDRESS, FACTORY_ABI, VAULT_ABI } from "./src/config/contracts.js";
dotenv.config();
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const WHALE_ADDRESS = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848"; // SRV11
async function debugWhale() {
    console.log("DEBUG: Connecting to RPC:", RPC_URL);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    // 1. Check native balance
    const nativeBal = await provider.getBalance(WHALE_ADDRESS);
    console.log(`Native BNB Balance: ${ethers.formatEther(nativeBal)} BNB`);
    // 2. Check Whitelisted Tokens
    console.log("\n--- Checking Whitelisted Tokens ---");
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
    for (const [symbol, config] of Object.entries(WHITELIST)) {
        console.log(`\nToken: ${symbol} (${config.address})`);
        const tokenContract = new ethers.Contract(config.address, ERC20_ABI, provider);
        try {
            const balance = await tokenContract.balanceOf(WHALE_ADDRESS);
            const fmtBalance = ethers.formatUnits(balance, config.decimals);
            console.log(`- Balance: ${fmtBalance}`);
            if (balance === 0n) {
                console.log("- Skipping price check (Balance is 0)");
                continue;
            }
            // Price Check via Router
            if (config.address.toLowerCase() === QUOTE_TOKEN_ADDRESS.toLowerCase()) {
                console.log("- Price: 1.0 (Quote Token)");
            }
            else {
                console.log(`- Checking Price on Router: ${ROUTER_ADDRESS}`);
                try {
                    const oneUnit = ethers.parseUnits("1.0", config.decimals);
                    const path = [config.address, QUOTE_TOKEN_ADDRESS];
                    const amounts = await router.getAmountsOut(oneUnit, path);
                    const price = ethers.formatUnits(amounts[1], QUOTE_TOKEN_DECIMALS);
                    console.log(`- Price: $${price}`);
                    console.log(`- Value: $${parseFloat(fmtBalance) * parseFloat(price)}`);
                }
                catch (e) {
                    console.error(`- Price Check Failed: ${e.shortMessage || e.message}`);
                }
            }
        }
        catch (e) {
            console.error(`- Error checking token: ${e.shortMessage || e.message}`);
        }
    }
    // 3. Check Factory for Vaults
    console.log("\n--- Checking Factory for Vaults ---");
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    try {
        const vault1Address = await factory.allVaults(1);
        console.log("Vault 1 Address:", vault1Address);
        // Inspect Vault 1
        const vault1 = new ethers.Contract(vault1Address, VAULT_ABI, provider);
        const owner = await vault1.owner();
        const targetWhale = await vault1.targetWhale();
        console.log(`- Owner: ${owner}`);
        console.log(`- Target Whale: ${targetWhale}`);
        if (targetWhale.toLowerCase() === WHALE_ADDRESS.toLowerCase()) {
            console.log("✅ Vault 1 is following SRV11!");
        }
        else {
            console.log("❌ Vault 1 is NOT following SRV11. It follows:", targetWhale);
        }
        // Check Vault 1 Balances
        console.log("- Checking Vault 1 Balances:");
        for (const [symbol, config] of Object.entries(WHITELIST)) {
            const tokenContract = new ethers.Contract(config.address, ERC20_ABI, provider);
            const balance = await tokenContract.balanceOf(vault1Address);
            console.log(`  - ${symbol}: ${ethers.formatUnits(balance, config.decimals)}`);
        }
    }
    catch (e) {
        console.log("Factory/Vault 1 Check Failed:", e.shortMessage || e.message);
    }
    // 4. Check Liquidity on Custom DEX
    console.log("\n--- Checking Liquidity on Custom DEX ---");
    const DEX_FACTORY = "0xecb64015331902795323b56A04710e2d6cC3A21d"; // From frontend .env
    const DEX_FACTORY_ABI = ["function getPair(address, address) view returns (address)"];
    const PAIR_ABI = ["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"];
    const dexFactory = new ethers.Contract(DEX_FACTORY, DEX_FACTORY_ABI, provider);
    const tokenA = WHITELIST.USDC.address; // 0x8AC7...
    const tokenB = WHITELIST.ETH.address; // 0xa2E3...
    try {
        const pairAddress = await dexFactory.getPair(tokenA, tokenB);
        console.log(`Pair Address (USDC/ETH): ${pairAddress}`);
        if (pairAddress === ethers.ZeroAddress) {
            console.log("❌ Pair does NOT exist on custom DEX.");
        }
        else {
            const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
            const [r0, r1] = await pair.getReserves();
            const t0 = await pair.token0();
            const rUSDC = (t0.toLowerCase() === tokenA.toLowerCase()) ? r0 : r1;
            const rETH = (t0.toLowerCase() === tokenA.toLowerCase()) ? r1 : r0;
            console.log(`Reserves USDC: ${ethers.formatUnits(rUSDC, 18)}`);
            console.log(`Reserves ETH: ${ethers.formatUnits(rETH, 18)}`);
            // Simple Price
            if (rUSDC > 0n) {
                const price = Number(ethers.formatUnits(rETH, 18)) / Number(ethers.formatUnits(rUSDC, 18));
                console.log(`Pool Price (ETH per USDC): ${price}`);
                console.log(`Implied USDC Price: $${price * 2000} (assuming ETH=$2000)`);
            }
        }
    }
    catch (e) {
        console.log("Liquidity Check Failed:", e.shortMessage || e.message);
    }
}
debugWhale();
//# sourceMappingURL=debug_whale_check.js.map