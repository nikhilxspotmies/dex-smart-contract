import { ethers } from "ethers";
import dotenv from "dotenv";
import { ERC20_ABI, ROUTER_ADDRESS, WHITELIST } from "./dist/config/contracts.js";

dotenv.config();

// Logic from src/index.ts:
// const amountToSell = sellItem.balance / 10n;

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const VAULT_ADDRESS = "0x5d27e74382DD41D75B0b4563A8E2D8CD1E0E6e00"; // Vault 1

// We know from debug_status_js that Vault ETH is 0.0001
// So amountToSell should be 0.00001 ETH.

async function checkSwap() {
    console.log("--- Debugging Swap Calculation ---");
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // 1. Get Real Balance
    // ETH Address (WBNB/MockETH in this context)
    // From logs: ETH: 0xa2E3356610840701BDf5611a53974510Ae27E2e1
    // From debug_status_js: ETH: 0xa2E3356610840701BDf5611a53974510Ae27E2e1
    const tokenIn = "0xa2E3356610840701BDf5611a53974510Ae27E2e1"; // ETH
    const tokenOut = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // USDC

    const ethParams = ["function balanceOf(address) view returns (uint256)"];
    const ethContract = new ethers.Contract(tokenIn, ethParams, provider);

    const balance = await ethContract.balanceOf(VAULT_ADDRESS);
    console.log(`Vault ETH Balance: ${balance.toString()} (${ethers.formatUnits(balance, 18)})`);

    if (balance === 0n) {
        console.log("Balance is 0. Engine should assume 0.");
        return;
    }

    const amountIn = balance / 10n;
    console.log(`Engine calculated AmountIn (10%): ${amountIn.toString()} (${ethers.formatUnits(amountIn, 18)})`);

    if (amountIn === 0n) {
        console.log("Amount too small to swap.");
        return;
    }

    // 2. Query Router
    // ROUTER_ADDRESS from .env is custom dex
    // We need to import or hardcode it from .env
    // contracts.js exports ROUTER_ADDRESS.
    // Let's rely on that import.
    // But contracts.js reads process.env.
    // Let's hardcode the problematic one specific to user config.
    const routerAddress = "0x104835d5Df633E685DA07d853B78D3d9369649BF";
    console.log(`Router: ${routerAddress}`);

    const routerAbi = [
        "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"
    ];
    const router = new ethers.Contract(routerAddress, routerAbi, provider);

    const path = [tokenIn, tokenOut];

    try {
        console.log(`Calling getAmountsOut(${amountIn}, path)...`);
        const amounts = await router.getAmountsOut(amountIn, path);
        console.log(`Result: ${amounts.map(a => a.toString())}`);

        const expectedOut = amounts[1];
        console.log(`Expected Output: ${ethers.formatUnits(expectedOut, 18)} USDC`);

        // Slippage calc
        const minAmountOut = 0n; // Force 0 to test if slippage is the issue
        console.log(`Min Amount Out (TEST: 0): ${minAmountOut.toString()}`);

        // 3. Execute Real Trade
        console.log("\n--- Attempting Execution ---");
        const PRIVATE_KEY = process.env.PRIVATE_KEY;
        if (!PRIVATE_KEY) return;

        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`Wallet: ${wallet.address}`);

        const vaultAbi = [
            "function rebalance(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] swaps) external"
        ];
        const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, wallet);

        // Encode path
        const coder = new ethers.AbiCoder();
        const encodedPath = coder.encode(['address[]'], [path]);

        const swapData = {
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            data: encodedPath
        };

        console.log("Sending rebalance...");
        try {
            // Try estimateGas first to see error
            const gas = await vault.rebalance.estimateGas([swapData]);
            console.log(`Gas Estimate: ${gas}`);

            const tx = await vault.rebalance([swapData]);
            console.log(`Tx Sent: ${tx.hash}`);
            await tx.wait();
            console.log("Tx Confirmed!");
        } catch (e) {
            console.error("❌ Execution Failed!");
            if (e.info && e.info.error) {
                console.error("Revert Info:", e.info.error);
            }
            if (e.data) {
                console.error("Raw Data:", e.data);
                // Try decoding common errors
                if (e.data === "0x08c379a0") console.error("Error(string) - empty");
                try {
                    const decoded = coder.decode(["string"], e.data);
                    console.error("Decoded Error:", decoded);
                } catch (err) { }
            }
            console.error("Error Object:", e);
        }
    } catch (e) {
        console.error("Outer Logic Failed:", e);
    }
}

checkSwap();
