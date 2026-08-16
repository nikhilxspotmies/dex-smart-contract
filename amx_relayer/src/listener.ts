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
        const startBlockEnv = process.env.START_BLOCK;
        fromBlock = startBlockEnv ? Number(startBlockEnv) : currentTip;
        console.log(
            `[listener] no prior scan state found; starting from ${startBlockEnv ? "START_BLOCK" : "current tip"} = ${fromBlock}`
        );
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
