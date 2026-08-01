/**
 * Dump the SHAPE of a Sumsub applicant payload so we can see where the verified name
 * actually lives (info.firstName? fixedInfo.firstName? info.idDocs[].firstName?).
 *
 * The SDK's TypeScript types are incomplete (`[key: string]: any`), so this asks the
 * live API instead of trusting them.
 *
 *   npx tsx src/scripts/inspectSumsubApplicant.ts <walletAddress>
 *   npx tsx src/scripts/inspectSumsubApplicant.ts <walletAddress> --raw
 *
 * Values are MASKED by default — this is real identity data. `--raw` prints them in
 * full; only use it on a sandbox applicant you own.
 */
import 'dotenv/config';
import { sdk } from 'sumsub-node-sdk';

const arg = process.argv[2];
const RAW = process.argv.includes('--raw');

if (!arg || arg.startsWith('--')) {
    console.error('usage: npx tsx src/scripts/inspectSumsubApplicant.ts <walletAddress> [--raw]');
    process.exit(1);
}
// Applicants created before the address normalisation may live under checksum casing,
// since the old code passed walletAddress through untouched — so try both spellings.
const candidateIds = Array.from(new Set([arg, arg.toLowerCase()]));

const sumsub = sdk({
    appToken: process.env.SUMSUB_APP_TOKEN!,
    secretKey: process.env.SUMSUB_SECRET_KEY!,
    baseURL: process.env.SUMSUB_BASE_URL || 'https://api.sumsub.com',
});

// Show the key and its type; mask the value unless --raw.
const mask = (v: unknown): string => {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (RAW) return JSON.stringify(v);
    if (typeof v === 'string') return v.length ? `"<string:${v.length}>"` : '""';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return Array.isArray(v) ? `[${v.length} items]` : '{...}';
};

// Walk the object printing a path -> type/value map, so nothing is missed.
const walk = (obj: any, prefix = '', depth = 0): void => {
    if (depth > 4 || obj === null || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            console.log(`  ${path}:`);
            walk(v, path, depth + 1);
        } else if (Array.isArray(v)) {
            console.log(`  ${path}: [${v.length}]`);
            v.slice(0, 2).forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
        } else {
            console.log(`  ${path} = ${mask(v)}`);
        }
    }
};

async function main() {
    console.log(RAW ? '(RAW MODE — real values shown)\n' : '(values masked; pass --raw to reveal)\n');

    let applicant: any = null;
    for (const id of candidateIds) {
        try {
            const res = await sumsub.getApplicantByExternalUserId(id);
            applicant = res.data;
            console.log(`Found applicant under externalUserId=${id}\n`);
            break;
        } catch (e: any) {
            if (e?.response?.status !== 404) throw e;
            console.log(`  (no applicant under "${id}")`);
        }
    }
    if (!applicant) {
        console.error('\nNo applicant found under any casing. Use a wallet that completed KYC.');
        process.exit(1);
    }

    console.log('─── full structure ───');
    walk(applicant);

    console.log('\n─── name lookup: where is it? ───');
    const candidates: Array<[string, unknown]> = [
        ['info.firstName', applicant?.info?.firstName],
        ['info.lastName', applicant?.info?.lastName],
        ['fixedInfo.firstName', applicant?.fixedInfo?.firstName],
        ['fixedInfo.lastName', applicant?.fixedInfo?.lastName],
        ['fixedInfo.firstNameEn', applicant?.fixedInfo?.firstNameEn],
        ['fixedInfo.lastNameEn', applicant?.fixedInfo?.lastNameEn],
        ['info.idDocs[0].firstName', applicant?.info?.idDocs?.[0]?.firstName],
        ['info.idDocs[0].lastName', applicant?.info?.idDocs?.[0]?.lastName],
        ['email', applicant?.email],
        ['phone', applicant?.phone],
        ['review.reviewStatus', applicant?.review?.reviewStatus],
        ['review.reviewResult.reviewAnswer', applicant?.review?.reviewResult?.reviewAnswer],
    ];
    for (const [path, value] of candidates) {
        const present = value !== undefined && value !== null && value !== '';
        console.log(`  ${present ? '✓' : '✗'} ${path.padEnd(28)} ${present ? mask(value) : '—'}`);
    }
}

main().catch((e: any) => {
    const status = e?.response?.status;
    const body = e?.response?.data;
    console.error(`\nFailed${status ? ` (HTTP ${status})` : ''}:`, body ?? e.message);
    if (status === 404) console.error('→ No applicant with that externalUserId. Use a wallet that completed KYC.');
    process.exit(1);
});
