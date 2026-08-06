/**
 * One-off migration for the wallet-only auth cutover.
 *
 * Run BEFORE deploying the new /api/user/auth endpoint:
 *   npx tsx src/scripts/migrateWalletOnlyAuth.ts          # dry run (default)
 *   npx tsx src/scripts/migrateWalletOnlyAuth.ts --apply  # actually write
 *
 * What it does:
 *   1. Reports users with no walletAddress   → these would be locked out; must be handled manually.
 *   2. Reports wallets that differ only by casing → true duplicates; must be merged manually.
 *   3. Lowercases every walletAddress and email.
 *   4. Drops the `password` field.
 *   5. Rebuilds the email index as sparse (so wallets without an email are allowed).
 */
import mongoose from 'mongoose';
import User from '../models/User.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/amerox-testnet';
const APPLY = process.argv.includes('--apply');
// Rebuild the email index only. Split out because it's non-destructive (indexes, not
// documents) and URGENT on its own: while `email_1` stays non-sparse, every user without
// an email indexes as null, so the SECOND account without one fails to insert.
const INDEXES_ONLY = process.argv.includes('--indexes-only');

const log = (...args: unknown[]) => console.log(...args);

async function main() {
    await mongoose.connect(MONGO_URI);
    log(`Connected to ${MONGO_URI}`);
    log(APPLY ? '\n=== APPLY MODE — changes will be written ===\n' : '\n=== DRY RUN — no changes written (pass --apply to write) ===\n');

    const col = mongoose.connection.collection('users');

    // Rebuild `email_1` as unique+sparse so absent emails stop colliding on null.
    const reindexEmail = async () => {
        const indexes = await col.indexes();
        const emailIdx = indexes.find((i: any) => i.key?.email === 1);
        if (emailIdx?.sparse) {
            log('    email index is already unique+sparse — nothing to do');
            return;
        }
        if (emailIdx) {
            await col.dropIndex(emailIdx.name!);
            log(`    → dropped non-sparse index ${emailIdx.name}`);
        }
        // Empty strings would still occupy a unique index; clear them first.
        const cleared = await col.updateMany({ email: '' }, { $unset: { email: '' } });
        if (cleared.modifiedCount) log(`    → cleared ${cleared.modifiedCount} empty email values`);
        await col.createIndex({ email: 1 }, { unique: true, sparse: true });
        log('    → created unique+sparse index on email');
    };

    if (INDEXES_ONLY) {
        log('[indexes-only] rebuilding the email index');
        if (APPLY) {
            await reindexEmail();
            log('\nIndex rebuild complete.');
        } else {
            const indexes = await col.indexes();
            const emailIdx = indexes.find((i: any) => i.key?.email === 1);
            log(`    current email index: ${emailIdx ? `${emailIdx.name} sparse=${!!emailIdx.sparse}` : 'none'}`);
            log('\nDry run — re-run with --indexes-only --apply to write.');
        }
        await mongoose.disconnect();
        return;
    }

    // ── 1. Users with no wallet (would be locked out by wallet-only auth) ──────
    const walletless = await col.find({ $or: [{ walletAddress: { $exists: false } }, { walletAddress: null }, { walletAddress: '' }] }).toArray();
    log(`[1] Users without a walletAddress: ${walletless.length}`);
    walletless.forEach((u: any) => log(`      - ${u._id} ${u.email ?? '(no email)'}`));
    if (walletless.length) log('    ^ These CANNOT sign in after the cutover. Resolve before applying.');

    // ── 2. Case-collision duplicates ──────────────────────────────────────────
    const dupes = await col.aggregate([
        { $match: { walletAddress: { $type: 'string', $ne: '' } } },
        { $group: { _id: { $toLower: '$walletAddress' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
    ]).toArray();
    log(`\n[2] Wallets duplicated across casings: ${dupes.length}`);
    dupes.forEach((d: any) => log(`      - ${d._id}: ${d.ids.join(', ')}`));
    if (dupes.length) {
        log('    ^ Lowercasing these would violate the unique index. Merge them manually first.');
        log('\nAborting: fix the duplicates above, then re-run.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // Same check for emails, which are about to become lowercase too.
    const dupeEmails = await col.aggregate([
        { $match: { email: { $type: 'string', $ne: '' } } },
        { $group: { _id: { $toLower: '$email' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
    ]).toArray();
    log(`\n[2b] Emails duplicated across casings: ${dupeEmails.length}`);
    dupeEmails.forEach((d: any) => log(`      - ${d._id}: ${d.ids.join(', ')}`));
    if (dupeEmails.length) {
        log('    ^ Merge or clear these before applying.');
        await mongoose.disconnect();
        process.exit(1);
    }

    // ── 3 & 4. Normalize casing + drop passwords ──────────────────────────────
    const toLowerCount = await col.countDocuments({
        $expr: { $ne: ['$walletAddress', { $toLower: '$walletAddress' }] },
    });
    const withPassword = await col.countDocuments({ password: { $exists: true } });
    log(`\n[3] Wallet addresses needing lowercasing: ${toLowerCount}`);
    log(`[4] Users with a stored password to remove: ${withPassword}`);

    if (APPLY) {
        const r = await col.updateMany({}, [
            {
                $set: {
                    walletAddress: { $toLower: '$walletAddress' },
                    email: {
                        $cond: [{ $eq: [{ $type: '$email' }, 'string'] }, { $toLower: '$email' }, '$email'],
                    },
                },
            },
            { $unset: 'password' },
        ]);
        log(`    → normalized ${r.modifiedCount} documents`);

        // ── 5. Rebuild the email index as sparse ──────────────────────────────
        await reindexEmail();
    }

    log(APPLY ? '\nMigration complete.' : '\nDry run complete — re-run with --apply to write.');
    await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
