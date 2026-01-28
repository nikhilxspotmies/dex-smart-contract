import { ethers } from "ethers";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// --- Configuration ---

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Placeholder Addresses (To be updated after deployment)
const VAULT_ADDRESS = process.env.VAULT_ADDRESS || "0x0000000000000000000000000000000000000000";
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000";

// Whitelist Configuration
const WHITELIST = {
    "TKA": {
        address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
        decimals: 18,
        symbol: "TKA"
    },
    "TKB": {
        address: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
        decimals: 18,
        symbol: "TKB"
    }
};

// --- ABIs ---

const VAULT_ABI = [
    "function userTargetWhale(address) view returns (address)",
    "function getUserBalance(address, address) view returns (uint256)",
    "function rebalanceUser(address user, tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] swaps) external"
];

const ROUTER_ABI = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"
];

const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// --- Types ---

interface SwapData {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    minAmountOut: bigint;
    data: string;
}

interface PortfolioItem {
    token: string;
    symbol: string;
    balance: bigint;
    valueUsd: number;
}

interface Portfolio {
    totalValueUsd: number;
    items: PortfolioItem[];
}

// --- State ---

let isProcessing = false;

// --- Setup ---

if (!PRIVATE_KEY) {
    console.error("Missing PRIVATE_KEY in .env");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

// --- Helpers ---

// Base Token for Pricing (TKB)
const QUOTE_TOKEN_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // TKB
const QUOTE_TOKEN_DECIMALS = 18;

// Fetch price relative to TKB from DEX
async function getTokenPrice(tokenAddress: string, tokenDecimals: number): Promise<number> {
    // 1. If token IS the quote token, price is 1
    if (tokenAddress.toLowerCase() === QUOTE_TOKEN_ADDRESS.toLowerCase()) {
        return 1.0;
    }

    try {
        // 2. Check Liquidity / Get Amount Out
        // How much TKB do I get for 1.0 of Token?
        const oneUnit = ethers.parseUnits("1.0", tokenDecimals);
        const path = [tokenAddress, QUOTE_TOKEN_ADDRESS];

        // getAmountsOut returns [amountIn, amountOut]
        const amounts = await router.getAmountsOut!(oneUnit, path);
        const amountOut = amounts[1];

        // Convert BigInt to number
        const price = Number(ethers.formatUnits(amountOut, QUOTE_TOKEN_DECIMALS));
        return price;
    } catch (error) {
        // Fallback or Pool doesn't exist
        console.warn(`Could not fetch price for ${tokenAddress}. Is there a liquidity pool [Token -> TKB]? Error: ${(error as any).shortMessage || error}`);
        return 0; // Return 0 to ignore this token in value calc
    }
}

// Fetch balances and calculate Value (in TKB terms)
async function calculatePortfolio(userAddress: string, type: "VAULT_INTERNAL" | "WALLET_EXTERNAL"): Promise<Portfolio> {
    let totalValueUsd = 0; // Actually Value in TKB
    const items: PortfolioItem[] = [];

    for (const [symbol, config] of Object.entries(WHITELIST)) {
        let balance = 0n;

        if (type === "VAULT_INTERNAL") {
            balance = await vault.getUserBalance!(userAddress, config.address);
        } else {
            const tokenContract = new ethers.Contract(config.address, ERC20_ABI, provider);
            try {
                balance = await tokenContract.balanceOf!(userAddress);
            } catch (e) {
                console.warn(`Failed to fetch balance for ${symbol}`);
            }
        }

        const price = await getTokenPrice(config.address, config.decimals);
        const formattedBalance = Number(ethers.formatUnits(balance, config.decimals));
        const valueUsd = formattedBalance * price;

        totalValueUsd += valueUsd;
        items.push({
            token: config.address,
            symbol,
            balance,
            valueUsd
        });
    }

    return { totalValueUsd, items };
}

// --- Core Logic ---

async function processUser(userAddress: string) {
    try {
        console.log(`\nAnalyzing user: ${userAddress}`);

        // 1. Get Target Whale
        const whaleAddress = await vault.userTargetWhale!(userAddress);
        if (whaleAddress === ethers.ZeroAddress) {
            console.log(`User ${userAddress} has no target whale.`);
            return;
        }
        console.log(`Target Whale: ${whaleAddress}`);

        // 2. Fetch Portfolios
        const userPortfolio = await calculatePortfolio(userAddress, "VAULT_INTERNAL");
        const whalePortfolio = await calculatePortfolio(whaleAddress, "WALLET_EXTERNAL");

        if (whalePortfolio.totalValueUsd === 0) {
            console.log("Whale portfolio is empty, skipping.");
            return;
        }

        // 3. Analyze Ratios & Deviations
        const swapsToExecute: SwapData[] = [];

        for (const whaleItem of whalePortfolio.items) {
            const whaleRatio = whaleItem.valueUsd / whalePortfolio.totalValueUsd;

            // Find corresponding user item
            const userItem = userPortfolio.items.find(i => i.token === whaleItem.token);
            const userValue = userItem ? userItem.valueUsd : 0;
            const userRatio = userPortfolio.totalValueUsd > 0 ? userValue / userPortfolio.totalValueUsd : 0;

            const deviation = Math.abs(whaleRatio - userRatio);

            // Threshold: 5% deviation
            if (deviation > 0.05) {
                console.log(`Deviation detected for ${whaleItem.symbol}: Whale ${(whaleRatio * 100).toFixed(1)}% vs User ${(userRatio * 100).toFixed(1)}%`);

                // Simplified Rebalance Logic:
                // If User is UNDER-allocated to this token, we need to buy it.
                // We find a token they are OVER-allocated to and sell it.

                if (userRatio < whaleRatio) {
                    // NEED TO BUY 'whaleItem.token' (Token B)
                    // Find a source token (Token A) that is over-allocated
                    // For MVP simplicity, we just swap TKA <-> TKB directly if pair exists.

                    // Logic: Find the token with highest positive deviation (User has too much of it)
                    // This is a basic executor implementation.

                    const sourceItem = userPortfolio.items.find(i => {
                        const wRatio = whalePortfolio.items.find(w => w.token === i.token)?.valueUsd || 0;
                        // Simplified: just find any token where user has balance > 0 and isn't the target
                        return i.token !== whaleItem.token && i.balance > 0n;
                    });

                    if (sourceItem) {
                        // Calculate amount to swap
                        // Target Value for Token B = TotalUserValue * WhaleRatio
                        // Current Value = userValue
                        // Deficit = Target - Current
                        // AmountToBuy = Deficit / Price

                        // We will just swap a chunk to move towards target. 
                        // Let's swap 50% of the available source balance for safety in this demo.
                        const amountIn = sourceItem.balance / 10n; // Swap 10% of holdings at a time to converge safely

                        if (amountIn > 0n) {
                            console.log(`> Planning swap: ${sourceItem.symbol} -> ${whaleItem.symbol}`);
                            const swapData = await createSwapData(sourceItem.token, whaleItem.token, amountIn);
                            if (swapData) swapsToExecute.push(swapData);
                        }
                    }
                }
            }
        }

        // 4. Execute Swaps
        if (swapsToExecute.length > 0) {
            console.log(`Executing ${swapsToExecute.length} swaps for ${userAddress}...`);
            const tx = await vault.rebalanceUser!(userAddress, swapsToExecute);
            console.log(`Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log("Rebalance confirmed.");
        } else {
            console.log("No rebalance needed.");
        }

    } catch (error) {
        console.error(`Error processing user ${userAddress}:`, error);
    }
}

async function createSwapData(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<SwapData | null> {
    try {
        const path = [tokenIn, tokenOut];

        // 1. Get Expected Output
        const amountsOut = await router.getAmountsOut!(amountIn, path);
        const expectedOut = amountsOut[1];

        // 2. Slippage Protection (1%)
        const minAmountOut = (expectedOut * 99n) / 100n;

        // 3. Encode Calldata for Router
        // function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 mins

        const routerInterface = new ethers.Interface(ROUTER_ABI);
        const data = routerInterface.encodeFunctionData("swapExactTokensForTokens", [
            amountIn,
            minAmountOut,
            path,
            VAULT_ADDRESS, // Recipient MUST be the Vault
            deadline
        ]);

        return {
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            data
        };
    } catch (error) {
        console.error("Error creating swap data:", error);
        return null;
    }
}

// --- Watcher Loop ---

// Mock Active Users (In prod, fetch from DB or Vault events)
const ACTIVE_USERS = [
    "0xe170e41B3839b821aA39cB2bfcA804b14826D5de",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" // Anvil Account 0
];

async function runWatcher() {
    if (isProcessing) {
        console.log("Watcher busy, skipping cycle.");
        return;
    }
    isProcessing = true;
    console.log(`\n--- Watcher Cycle Started [${new Date().toISOString()}] ---`);

    try {
        for (const user of ACTIVE_USERS) {
            await processUser(user);
        }
    } catch (error) {
        console.error("Watcher fatal error:", error);
    } finally {
        isProcessing = false;
        console.log("--- Watcher Cycle Finished ---");
    }
}

// Schedule Cron
cron.schedule('*/5 * * * *', runWatcher);

console.log("Copy Trading Engine Started. Waiting for cron...");
// Run once immediately for dev/test
runWatcher();
