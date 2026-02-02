import { ethers } from "ethers";
import { ROUTER_ADDRESS, ROUTER_ABI, VAULT_ABI } from "../config/contracts.js";
import { processFirstTradeReferral } from "./referral.service.js";

export interface SwapData {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    minAmountOut: bigint;
    data: string;
}

export class TradeExecutor {
    private signer: ethers.Wallet;
    private router: ethers.Contract;

    constructor(signer: ethers.Wallet) {
        this.signer = signer;
        this.router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
    }

    async constructSwap(tokenIn: string, tokenOut: string, amountIn: bigint, vaultAddress: string): Promise<SwapData | null> {
        try {
            const path = [tokenIn, tokenOut];

            // 1. Get Expected Output from Router
            // getAmountsOut(uint amountIn, address[] memory path)
            const amountsOut = await (this.router as any).getAmountsOut(amountIn, path);
            const expectedOut = amountsOut[1];

            // 2. Slippage Protection (1%)
            const minAmountOut = (expectedOut * 99n) / 100n;

            // 3. Encode Path for Vault -> Router interaction
            // The Vault expects 'data' to be abi.encode(path)
            const coder = new ethers.AbiCoder();
            const data = coder.encode(['address[]'], [path]);

            return {
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                data
            };
        } catch (error) {
            console.error(`Error calculating swap path ${tokenIn} -> ${tokenOut}:`, error);
            return null;
        }
    }

    async executeRebalance(vaultAddress: string, swaps: SwapData[], ownerAddress?: string) {
        if (swaps.length === 0) return;

        console.log(`Executing ${swaps.length} swaps for vault: ${vaultAddress}`);

        try {
            // Connect to User's Vault with Executor Signer
            const vault = new ethers.Contract(vaultAddress, VAULT_ABI, this.signer);

            // Execute
            const tx = await (vault as any).rebalance(swaps);
            console.log(`Rebalance Tx Sent: ${tx.hash}`);
            await tx.wait();
            console.log(`Rebalance Confirmed.`);

            // Process referral for vault owner (first trade reward)
            if (ownerAddress) {
                processFirstTradeReferral(ownerAddress).catch(e => console.error('Referral error:', e));
            }
        } catch (error) {
            console.error(`Rebalance failed for ${vaultAddress}:`, error);
        }
    }
}
