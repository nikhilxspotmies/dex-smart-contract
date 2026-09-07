import { ethers } from "ethers";
import { config } from "./config.js";
import { getBscProvider } from "./listener.js";
import { getActionableDeposits, getStaleReleaseSent, markReleaseSent, markReleased, markFailed, type DepositRow } from "./db.js";
import amxVaultAbi from "./abis/AmxVault.json" with { type: "json" };

const amerorxProvider = new ethers.JsonRpcProvider(config.amerorxRpcUrl);
const relayerWallet = new ethers.Wallet(config.relayerPrivateKey, amerorxProvider);
const amxVault = new ethers.Contract(config.amxVaultAddress, amxVaultAbi, relayerWallet);

function requiredConfirmations(amxOut: bigint): number {
    return amxOut >= config.largeThresholdAmxE18 ? config.confirmationsLarge : config.confirmationsSmall;
}

/** Races `promise` against a timer so a hung await (e.g. tx.wait() during an Amero X outage)
 * fails fast instead of blocking the single-threaded mainLoop forever — see config.releaseWaitTimeoutMs. */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function hasEnoughConfirmations(deposit: DepositRow): Promise<boolean> {
    const bscProvider = getBscProvider();
    const currentBlock = await bscProvider.getBlockNumber();
    const confirmations = currentBlock - deposit.block_number + 1;
    return confirmations >= requiredConfirmations(BigInt(deposit.amx_out));
}

/** Attempts to release a single deposit. The on-chain nullifier in AmxVault is the ultimate
 * safety net against a double-payout, but we check our own DB status first (idempotency
 * defense-in-depth) so we don't even attempt a redundant transaction in the common case. */
async function releaseDeposit(deposit: DepositRow): Promise<void> {
    if (!(await hasEnoughConfirmations(deposit))) {
        return; // not ready yet, try again next loop
    }

    try {
        const tx = await amxVault.release(deposit.deposit_id, deposit.buyer, BigInt(deposit.amx_out));
        markReleaseSent(deposit.deposit_id, tx.hash);
        console.log(`[executor] release() sent for deposit=${deposit.deposit_id} tx=${tx.hash}`);

        const receipt = await withTimeout<ethers.ContractTransactionReceipt | null>(
            tx.wait(),
            config.releaseWaitTimeoutMs,
            `release tx wait timed out after ${config.releaseWaitTimeoutMs}ms (tx may still confirm later)`
        );
        if (receipt && receipt.status === 1) {
            markReleased(deposit.deposit_id);
            console.log(`[executor] release() confirmed for deposit=${deposit.deposit_id}`);
        } else {
            markFailed(deposit.deposit_id, `release tx reverted: ${tx.hash}`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // AmxVault's own nullifier already rejected this depositId — meaning it was actually
        // released before (e.g. a prior attempt's receipt was never seen due to a crash between
        // sending and recording). Treat as success, not failure: the money did arrive.
        if (message.includes("already released")) {
            markReleased(deposit.deposit_id);
            console.log(`[executor] deposit=${deposit.deposit_id} was already released on-chain; reconciled`);
            return;
        }

        markFailed(deposit.deposit_id, message);
        console.error(`[executor] release() failed for deposit=${deposit.deposit_id}: ${message}`);
    }
}

/** Deposits whose release tx was sent but never confirmed (crash, dropped tx, etc.) — re-check
 * their actual on-chain status directly rather than blindly resending, since resending a tx
 * that actually did land would just hit the nullifier and log a false failure. */
async function reconcileStaleReleases(): Promise<void> {
    const stale = getStaleReleaseSent(10);
    for (const deposit of stale) {
        const alreadyReleased: boolean = await amxVault.released(deposit.deposit_id);
        if (alreadyReleased) {
            markReleased(deposit.deposit_id);
            console.log(`[executor] reconciled stale deposit=${deposit.deposit_id} as released`);
        } else {
            // Genuinely never landed — fall back into the retry pool.
            markFailed(deposit.deposit_id, "release tx never confirmed within timeout");
        }
    }
}

export async function runExecutorTick(): Promise<void> {
    await reconcileStaleReleases();

    const actionable = getActionableDeposits();
    for (const deposit of actionable) {
        await releaseDeposit(deposit);
    }
}
