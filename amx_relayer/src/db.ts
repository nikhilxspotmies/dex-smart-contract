import Database from "better-sqlite3";
import { config } from "./config.js";

// Deposit lifecycle: seen -> release_sent -> released
//                                          \-> failed (retried until it succeeds)
export type DepositStatus = "seen" | "release_sent" | "released" | "failed";

export interface DepositRow {
    deposit_id: string;
    tx_hash: string;
    log_index: number;
    block_number: number;
    buyer: string;
    asset: string;
    amount_in: string;
    amx_out: string;
    status: DepositStatus;
    release_tx_hash: string | null;
    attempts: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
}

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS deposits (
        deposit_id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        buyer TEXT NOT NULL,
        asset TEXT NOT NULL,
        amount_in TEXT NOT NULL,
        amx_out TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'seen',
        release_tx_hash TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_log ON deposits(tx_hash, log_index);

    -- Single-row table tracking the last BSC block fully scanned, so a restart resumes
    -- from here instead of only watching new events (tail-only watching silently loses
    -- events during downtime — unacceptable when a missed event means a customer's
    -- payment never gets paid out).
    CREATE TABLE IF NOT EXISTS scan_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_scanned_block INTEGER NOT NULL
    );
`);

export function getLastScannedBlock(): number | null {
    const row = db.prepare("SELECT last_scanned_block FROM scan_state WHERE id = 1").get() as
        | { last_scanned_block: number }
        | undefined;
    return row?.last_scanned_block ?? null;
}

export function setLastScannedBlock(block: number): void {
    db.prepare(
        `INSERT INTO scan_state (id, last_scanned_block) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET last_scanned_block = excluded.last_scanned_block`
    ).run(block);
}

/** Records a newly-seen deposit. No-op if this (txHash, logIndex) was already recorded —
 * this is the idempotency guard: a duplicate event delivery (e.g. from RPC retries or a
 * backfill re-scanning an already-processed range) can never be double-inserted. */
export function recordDepositSeen(args: {
    depositId: string;
    txHash: string;
    logIndex: number;
    blockNumber: number;
    buyer: string;
    asset: string;
    amountIn: string;
    amxOut: string;
}): void {
    db.prepare(
        `INSERT OR IGNORE INTO deposits
         (deposit_id, tx_hash, log_index, block_number, buyer, asset, amount_in, amx_out)
         VALUES (@depositId, @txHash, @logIndex, @blockNumber, @buyer, @asset, @amountIn, @amxOut)`
    ).run(args);
}

export function getDeposit(depositId: string): DepositRow | undefined {
    return db.prepare("SELECT * FROM deposits WHERE deposit_id = ?").get(depositId) as
        | DepositRow
        | undefined;
}

/** Deposits that still need a release attempt: never sent, or sent but not yet confirmed
 * released, or previously failed (eligible for retry). */
export function getActionableDeposits(): DepositRow[] {
    return db
        .prepare("SELECT * FROM deposits WHERE status IN ('seen', 'failed') ORDER BY created_at ASC")
        .all() as DepositRow[];
}

export function markReleaseSent(depositId: string, releaseTxHash: string): void {
    db.prepare(
        `UPDATE deposits SET status = 'release_sent', release_tx_hash = ?, attempts = attempts + 1,
         updated_at = datetime('now') WHERE deposit_id = ?`
    ).run(releaseTxHash, depositId);
}

export function markReleased(depositId: string): void {
    db.prepare(
        `UPDATE deposits SET status = 'released', last_error = NULL, updated_at = datetime('now')
         WHERE deposit_id = ?`
    ).run(depositId);
}

export function markFailed(depositId: string, error: string): void {
    db.prepare(
        `UPDATE deposits SET status = 'failed', last_error = ?, attempts = attempts + 1,
         updated_at = datetime('now') WHERE deposit_id = ?`
    ).run(error, depositId);
}

/** Deposits stuck in release_sent for longer than a sane confirmation window — their release
 * tx may have been dropped/replaced and never confirmed. Surfaced for the executor to re-check. */
export function getStaleReleaseSent(olderThanMinutes: number): DepositRow[] {
    return db
        .prepare(
            `SELECT * FROM deposits WHERE status = 'release_sent'
             AND updated_at < datetime('now', ?)`
        )
        .all(`-${olderThanMinutes} minutes`) as DepositRow[];
}

export default db;
