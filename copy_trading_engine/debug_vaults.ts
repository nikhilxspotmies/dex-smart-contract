import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0xEca72d3FbC8AA012aC563ff30499CD796f005933";

const FACTORY_ABI = [
    "function allVaults(uint256) view returns (address)",
    "function userVaults(address) view returns (address)"
];

const VAULT_ABI = [
    "function owner() view returns (address)",
    "function targetWhale() view returns (address)",
    "function version() view returns (uint256)"
];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// Whitelist from contracts.ts (as observed)
const TOKENS = [
    { symbol: "USDC", address: process.env.TOKEN_A_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    { symbol: "ETH (TokenB)", address: process.env.TOKEN_B_ADDRESS || "0xa2E3356610840701BDf5611a53974510Ae27E2e1", decimals: 18 } // Assuming 18
];

async function main() {
    console.log("Connecting to RPC:", RPC_URL);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    console.log("Scanning all vaults...");

    let index = 0;
    while (true) {
        try {
            const vaultAddr = await factory.allVaults(index);
            if (vaultAddr === ethers.ZeroAddress) {
                console.log(`Index ${index}: Zero Address. Stopping.`);
                break;
            }

            console.log(`\n--- Vault #${index}: ${vaultAddr} ---`);
            try {
                const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
                const owner = await vault.owner();
                const targetWhale = await vault.targetWhale();

                console.log(`Owner: ${owner}`);
                console.log(`Target Whale: ${targetWhale}`);

                // Check Balances
                for (const token of TOKENS) {
                    const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
                    const bal = await tokenContract.balanceOf(vaultAddr);
                    console.log(`Balance ${token.symbol}: ${ethers.formatUnits(bal, token.decimals)}`);
                }

            } catch (e) {
                console.log("Error reading vault details:", e.message);
            }

            index++;
        } catch (e) {
            console.log(`Finished scanning. Total accessible vaults: ${index}`);
            break;
        }
    }
}

main();
