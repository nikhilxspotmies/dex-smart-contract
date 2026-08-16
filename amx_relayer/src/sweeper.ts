import { ethers } from "ethers";
import { config } from "./config.js";
import { getBscProvider } from "./listener.js";
import amxSaleAbi from "./abis/AmxSale.json" with { type: "json" };

const ERC20_BALANCE_ABI = ["function balanceOf(address) view returns (uint256)"];

const bscSweeperWallet = new ethers.Wallet(config.relayerPrivateKey, getBscProvider());
const amxSale = new ethers.Contract(config.amxSaleAddress, amxSaleAbi, bscSweeperWallet);

let lastSweepAt = 0;

async function sweepIfWorthwhile(
    label: string,
    getBalance: () => Promise<bigint>,
    minThreshold: bigint,
    doSweep: () => Promise<ethers.ContractTransactionResponse>
): Promise<void> {
    const balance = await getBalance();
    if (balance < minThreshold) {
        console.log(`[sweeper] ${label} balance ${balance} below threshold ${minThreshold}, skipping`);
        return;
    }

    try {
        const tx = await doSweep();
        console.log(`[sweeper] ${label} sweep sent: tx=${tx.hash} amount=${balance}`);
        await tx.wait();
        console.log(`[sweeper] ${label} sweep confirmed: tx=${tx.hash}`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[sweeper] ${label} sweep failed: ${message}`);
    }
}

export async function runSweepTickIfDue(): Promise<void> {
    const now = Date.now();
    if (now - lastSweepAt < config.sweepIntervalMs) return;
    lastSweepAt = now;

    const provider = getBscProvider();
    const usdcAddress: string = await amxSale.usdc();
    const usdtAddress: string = await amxSale.usdt();
    const usdc = new ethers.Contract(usdcAddress, ERC20_BALANCE_ABI, provider);
    const usdt = new ethers.Contract(usdtAddress, ERC20_BALANCE_ABI, provider);

    await sweepIfWorthwhile(
        "BNB",
        () => provider.getBalance(config.amxSaleAddress),
        config.minSweepBnbE18,
        () => amxSale.sweepBNB()
    );

    await sweepIfWorthwhile(
        "USDC",
        () => usdc.balanceOf(config.amxSaleAddress),
        config.minSweepTokenE18,
        () => amxSale.sweepToken(usdcAddress)
    );

    await sweepIfWorthwhile(
        "USDT",
        () => usdt.balanceOf(config.amxSaleAddress),
        config.minSweepTokenE18,
        () => amxSale.sweepToken(usdtAddress)
    );
}
