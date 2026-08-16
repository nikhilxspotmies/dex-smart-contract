import { config } from "./config.js";
import { catchUp } from "./listener.js";
import { runExecutorTick } from "./executor.js";
import { runSweepTickIfDue } from "./sweeper.js";

let running = true;
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

async function mainLoop(): Promise<void> {
    console.log("[amx_relayer] starting");
    console.log(`[amx_relayer] AmxSale=${config.amxSaleAddress} (BSC) -> AmxVault=${config.amxVaultAddress} (Amero X)`);

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

mainLoop();
