import { ethers } from "ethers";
import { config } from "./config.js";
import { getLastScannedBlock, setLastScannedBlock, recordDepositSeen } from "./db.js";
import amxSaleAbi from "./abis/AmxSale.json" with { type: "json" };

const bscProvider = new ethers.JsonRpcProvider(config.bscRpcUrl);
const amxSale = new ethers.Contract(config.amxSaleAddress, amxSaleAbi, bscProvider);

async function scanRange(fromBlock: number, toBlock: number): Promise<void> {
    const filter = amxSale.filters.Purchased();
    const events = await amxSale.queryFilter(filter, fromBlock, toBlock);

    for (const event of events) {
        if (!("args" in event) || !event.args) continue; // skip malformed/unparsed logs
        // depositId is computed on-chain by AmxSale itself and emitted directly — the relayer
        // just reads it, it never re-derives it. See AmxSale.sol's computeDepositId().
        const { buyer, asset, amountIn, amxOut, depositId } = event.args;

        recordDepositSeen({
            depositId,
            txHash: event.transactionHash,
            logIndex: event.index,
            blockNumber: event.blockNumber,
            buyer,
            asset,
            amountIn: amountIn.toString(),
            amxOut: amxOut.toString(),
        });

        console.log(
            `[listener] Purchased seen: tx=${event.transactionHash} logIndex=${event.index} buyer=${buyer} amxOut=${amxOut.toString()}`
        );
    }
}

/** Scans from the last-recorded block up to the current chain tip, in safe-sized chunks
 * (bsc-rpc.publicnode.com is documented reliable up to ~5k blocks per getLogs call — default
 * chunk size stays well under that). Persists progress after every chunk, so a crash mid-scan
 * resumes from where it left off rather than re-scanning from scratch or, worse, silently
 * skipping ahead. */
export async function catchUp(): Promise<void> {
    const currentTip = await bscProvider.getBlockNumber();
    let fromBlock = getLastScannedBlock();

    if (fromBlock === null) {
        // Unreachable in practice — index.ts refuses to start without START_BLOCK when there's
        // no scan state. Kept as a guard so this can never silently degrade to tip-scanning if
        // catchUp() is ever called from somewhere that skipped the preflight.
        if (config.startBlock === undefined) {
            throw new Error(
                "No scan state and no START_BLOCK — refusing to scan from the tip, which would skip prior purchases."
            );
        }
        fromBlock = config.startBlock;
        console.log(`[listener] no prior scan state found; starting from START_BLOCK = ${fromBlock}`);
    } else {
        fromBlock += 1; // resume from the block after the last one we finished
    }

    while (fromBlock <= currentTip) {
        const toBlock = Math.min(fromBlock + config.backfillChunkSize - 1, currentTip);
        await scanRange(fromBlock, toBlock);
        setLastScannedBlock(toBlock);
        fromBlock = toBlock + 1;
    }
}

export function getBscProvider(): ethers.JsonRpcProvider {
    return bscProvider;
}
