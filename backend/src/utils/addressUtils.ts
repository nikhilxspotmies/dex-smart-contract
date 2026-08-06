// H1/H7: validates an Ethereum address and returns it lowercased, or null if invalid.
// Call this before interpolating any user-supplied address into a DB query.
// Validated 0x[0-9a-f]{40} values contain no regex metacharacters, making
// { $regex: `^${addr}$`, $options: 'i' } safe once the address passes this check.
export function normalizeAddress(val: unknown): string | null {
    if (typeof val !== 'string') return null;
    const addr = val.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr)) return null;
    return addr;
}
