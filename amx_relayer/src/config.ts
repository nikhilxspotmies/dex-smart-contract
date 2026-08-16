import dotenv from "dotenv";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The package root, derived from this file's own location rather than process.cwd().
// Holds for both layouts: <pkg>/src/config.ts and <pkg>/dist/config.js are each one
// directory below the root.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Explicit path rather than `import "dotenv/config"`, which resolves .env against the working
// directory — so the service would pick up its configuration only when launched from its own
// folder. Anchoring here means `node /path/to/amx_relayer/dist/index.js` works from anywhere.
dotenv.config({ path: resolve(packageRoot, ".env") });

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function envOr(name: string, fallback: string): string {
    return process.env[name] ?? fallback;
}

/**
 * Resolves a relative DB path against the package root instead of the working directory.
 *
 * This matters more than it looks: better-sqlite3 silently CREATES a database that isn't
 * there. So a cwd-relative path that resolves somewhere unexpected doesn't fail — it opens
 * a brand new empty DB, which reads as "no scan state", which makes the listener resume
 * from the current chain tip. Every purchase in the gap is skipped, and a skipped purchase
 * is a customer who paid and never got their AMX. Anchoring to the package root means the
 * file is found no matter where the process was launched from.
 */
function resolveDbPath(value: string): string {
    return isAbsolute(value) ? value : resolve(packageRoot, value);
}

export const config = {
    // BSC (source chain — where purchases happen)
    bscRpcUrl: envOr("BSC_RPC_URL", "https://bsc-rpc.publicnode.com"),
    amxSaleAddress: requireEnv("AMX_SALE_ADDRESS"),

    // Amero X (destination chain — where AMX is paid out)
    amerorxRpcUrl: requireEnv("AMEROX_RPC_URL"),
    amxVaultAddress: requireEnv("AMX_VAULT_ADDRESS"),
    relayerPrivateKey: requireEnv("RELAYER_PRIVATE_KEY"),

    // Confirmation thresholds, tiered by the AMX amount a purchase would pay out (1e18-scaled)
    // — larger payouts wait for more BSC confirmations before being triggered, since that's
    // the actual value at risk of the relayer's action if BSC were to reorg.
    confirmationsSmall: Number(envOr("CONFIRMATIONS_SMALL", "15")),
    confirmationsLarge: Number(envOr("CONFIRMATIONS_LARGE", "45")),
    largeThresholdAmxE18: BigInt(envOr("LARGE_THRESHOLD_AMX_E18", String(2000n * 10n ** 18n))), // 2,000 AMX ($1,000 @ $0.50)

    // getLogs range safety — bsc-rpc.publicnode.com is documented safe up to ~5k blocks;
    // stay well under that. See memory: alchemy-bsc-getlogs-cap.
    backfillChunkSize: Number(envOr("BACKFILL_CHUNK_SIZE", "2000")),
    pollIntervalMs: Number(envOr("POLL_INTERVAL_MS", "15000")),

    // Auto-sweep: periodically pushes AmxSale's accumulated BNB/USDC/USDT to their treasury
    // addresses. Uses the same relayer key as a BSC gas-payer — sweep() is permissionless (no
    // role needed), so this doesn't grant the key any new on-chain privilege, just reuses it as
    // a fee-payer for a public function, same as it already is for release() on Amero X.
    sweepIntervalMs: Number(envOr("SWEEP_INTERVAL_MS", String(30 * 60 * 1000))), // 30 min
    minSweepBnbE18: BigInt(envOr("MIN_SWEEP_BNB_E18", String(1n * 10n ** 15n))), // 0.001 BNB
    minSweepTokenE18: BigInt(envOr("MIN_SWEEP_TOKEN_E18", String(1n * 10n ** 18n))), // 1 token

    dbPath: resolveDbPath(envOr("DB_PATH", "./relayer.sqlite")),

    // Only consulted on the very first run, when the DB has no scan state yet. Undefined here
    // is a hard startup error rather than a silent fall back to the chain tip — see index.ts.
    startBlock: process.env.START_BLOCK ? Number(process.env.START_BLOCK) : undefined,
} as const;

if (config.startBlock !== undefined && !Number.isInteger(config.startBlock)) {
    throw new Error(`START_BLOCK must be an integer block number, got: ${process.env.START_BLOCK}`);
}
