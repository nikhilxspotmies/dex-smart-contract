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
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)",
    "event SwapExecuted(address indexed sender, address[] path, uint256[] amounts, address indexed to)"
];

export const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// --- Whitelist ---
// `decimals` here are defaults; the real values are read on-chain by
// resolveTokenDecimals() at startup so we never assume 18 (local USDC is 6-dec).
// Expanded from the original 2-token (USDC/ETH) demo whitelist to match the full
// token list backend/src/constants/tokens.ts uses for real whale portfolio pricing —
// keeping the two whitelists in sync is a manual, accepted duplication (same pattern
// as the ABI duplication CLAUDE.md already documents elsewhere).
export const WHITELIST = {
    "USDC": {
        // Token A (kept for backward compat with existing TOKEN_A_ADDRESS env var)
        address: process.env.TOKEN_A_ADDRESS || process.env.USDC_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        decimals: 18,
        symbol: "USDC"
    },
    "ETH": {
        // Token B (kept for backward compat with existing TOKEN_B_ADDRESS env var)
        address: process.env.TOKEN_B_ADDRESS || process.env.ETH_ADDRESS || "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
        decimals: 18,
        symbol: "ETH"
    },
    "BTCB": { address: process.env.BTCB_ADDRESS || "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18, symbol: "BTCB" },
    "USDT": { address: process.env.USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955", decimals: 18, symbol: "USDT" },
    "WBNB": { address: process.env.WBNB_ADDRESS || "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, symbol: "WBNB" },
    "XRP": { address: process.env.XRP_ADDRESS || "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", decimals: 18, symbol: "XRP" },
    "SOL": { address: process.env.SOL_ADDRESS || "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", decimals: 18, symbol: "SOL" },
    "TRX": { address: process.env.TRX_ADDRESS || "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3", decimals: 6, symbol: "TRX" },
    "DOGE": { address: process.env.DOGE_ADDRESS || "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", decimals: 8, symbol: "DOGE" },
    "CAKE": { address: process.env.CAKE_ADDRESS || "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18, symbol: "CAKE" },
};

// Base Token for Pricing (the quote token). Switched from ETH to USDT so this
// engine's portfolio valuations agree with backend/src/services/WhaleStatsService.ts
// (which already quotes in USDT) — otherwise the same whale could show two different
// "portfolio values" depending on which service computed it.
// QUOTE_TOKEN_DECIMALS is populated on-chain by resolveTokenDecimals() — exported as
// `let` so importers see the resolved value via live bindings.
export const QUOTE_TOKEN_ADDRESS = WHITELIST.USDT.address;
export let QUOTE_TOKEN_DECIMALS = 18;

/**
 * Read each whitelisted token's real decimals from the chain and patch the
 * WHITELIST + QUOTE_TOKEN_DECIMALS. Call once at engine startup before any
 * portfolio/price math. Safe on both Anvil (mixed 6/18) and BSC (18).
 */
export async function resolveTokenDecimals(provider: ethers.Provider): Promise<void> {
    for (const config of Object.values(WHITELIST)) {
        try {
            const token = new ethers.Contract(config.address, ERC20_ABI, provider);
            config.decimals = Number(await (token as any).decimals());
        } catch (e) {
            console.warn(`Could not read decimals for ${config.symbol} (${config.address}), keeping ${config.decimals}`);
        }
    }
    QUOTE_TOKEN_DECIMALS = WHITELIST.USDT.decimals;
    console.log(`Resolved decimals for ${Object.keys(WHITELIST).length} whitelisted tokens (quote: USDT, ${WHITELIST.USDT.decimals} dec)`);
}
