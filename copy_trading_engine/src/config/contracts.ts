import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// --- Environment Variables ---

export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
export const PRIVATE_KEY = process.env.PRIVATE_KEY!;

if (!PRIVATE_KEY) {
    console.error("CRITICAL: Missing PRIVATE_KEY in .env");
    process.exit(1);
}

// Addresses (To be filled by User after deployment)
export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000";
export const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000";

// --- ABIs ---

export const FACTORY_ABI = [
    "function userVaults(address) view returns (address)",
    "function allVaults(uint256) view returns (address)",
    // Note: Depends on if we added a function to get all vaults count/list.
    // The current contract has 'address[] public allVaults', so:
    "function allVaults(uint256) view returns (address)",
    // Wait, public array getter only returns one item by index. 
    // We didn't add a getLength function, but usually generated getters work.
    // Ideally we should have a `getAllVaults` or use events. 
    // For now, let's assume we iterate or fetch by index if we knew the length.
    // Actually, looking at the contract 'address[] public allVaults':
    // Solidity auto-generates: function allVaults(uint256 index) external view returns (address)
    // It does NOT give us the length. This is a small oversight in the contract if we want to iterate.
    // BUT we emitted 'VaultCreated'. We can query logs.
    "event VaultCreated(address indexed user, address indexed vault)"
];

export const VAULT_ABI = [
    "function owner() view returns (address)",
    "function targetWhale() view returns (address)",
    "function initialize(address, address, address) external",
    "function rebalance(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] swaps) external"
];

export const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)"
];

export const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// --- Whitelist ---
// Updated to match the Integration Script Mocks if possible, or generic placeholders
export const WHITELIST = {
    "USDC": {
        // Replace with deployed Token A address
        address: process.env.TOKEN_A_ADDRESS || "0x0000000000000000000000000000000000000000",
        decimals: 18,
        symbol: "USDC"
    },
    "ETH": {
        // Replace with deployed Token B address
        address: process.env.TOKEN_B_ADDRESS || "0x0000000000000000000000000000000000000000",
        decimals: 18,
        symbol: "ETH"
    }
};

// Base Token for Pricing (USD-like or Native)
// For this demo, let's assume ETH is the "Quote" token (like USDC)
export const QUOTE_TOKEN_ADDRESS = WHITELIST.ETH.address;
export const QUOTE_TOKEN_DECIMALS = 18;
