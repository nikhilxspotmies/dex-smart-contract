import "dotenv/config";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

function envOr(name: string, fallback: string): string {
    return process.env[name] ?? fallback;
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

    dbPath: envOr("DB_PATH", "./relayer.sqlite"),
} as const;
