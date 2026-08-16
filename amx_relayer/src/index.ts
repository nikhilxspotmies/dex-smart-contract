import { config } from "./config.js";
import { getLastScannedBlock } from "./db.js";
import { catchUp } from "./listener.js";
import { runExecutorTick } from "./executor.js";
import { runSweepTickIfDue } from "./sweeper.js";

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

/**
 * A first run with no START_BLOCK used to fall back to the current chain tip, which silently
 * skips every purchase made before the relayer came up — customers who paid but never got
 * paid out, with nothing in the logs to say so. Refusing to boot is the safer failure: it's
 * loud, and it's trivially fixable by setting one env var.
 */
function preflight(): void {
    if (getLastScannedBlock() === null && config.startBlock === undefined) {
        console.error(
            `[amx_relayer] refusing to start: no scan state in ${config.dbPath} and START_BLOCK is not set.\n` +
                "  Set START_BLOCK to the block AmxSale was deployed at, then restart.\n" +
                "  (If you expected existing state, check DB_PATH — a wrong path opens a new empty database.)"
        );
        process.exit(1);
    }
}

async function mainLoop(): Promise<void> {
    console.log("[amx_relayer] starting");
    console.log(`[amx_relayer] AmxSale=${config.amxSaleAddress} (BSC) -> AmxVault=${config.amxVaultAddress} (Amero X)`);
    // Logged so a wrong path is visible on sight instead of surfacing later as lost events.
    console.log(`[amx_relayer] db=${config.dbPath}`);

    while (running) {
        try {
            await catchUp();
            await runExecutorTick();
            await runSweepTickIfDue();
        } catch (err) {
            // A single tick failing (RPC hiccup, transient network error) should not crash the
            // whole service — log and retry on the next tick rather than exiting.
            console.error("[amx_relayer] tick failed:", err instanceof Error ? err.message : err);
        }

        await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }

    console.log("[amx_relayer] shutting down");
}

preflight();
mainLoop();
