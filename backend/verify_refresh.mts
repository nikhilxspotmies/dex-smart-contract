// Integration verification for the refresh-token session system.
// Drives the REAL express app + REAL MongoDB. Run: node --loader ts-node/esm verify_refresh.mts
import mongoose from 'mongoose';
import request from 'supertest';
import app from './dist/app.js';
import User from './dist/models/User.js';
import RefreshToken from './dist/models/RefreshToken.js';
import signAccessToken from './dist/utils/generateToken.js';
import { issueRefreshToken, revokeFamily } from './dist/utils/refreshToken.js';
import { issueCsrfToken } from './dist/utils/csrf.js';
import { env } from './dist/config/env.js';

const DB = 'mongodb://127.0.0.1:27017/amerox_verify_refresh';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
    cond ? pass++ : fail++;
};

// Build a live session for a user the same way startSession does, returning cookie values.
async function newSession(userId: string) {
    const familyId = crypto.randomUUID();
    const familyCreatedAt = new Date();
    const access = signAccessToken(userId, familyId);
    const { raw: refresh, doc } = await issueRefreshToken(userId, familyId, familyCreatedAt);
    const csrf = issueCsrfToken(familyId);
    return { familyId, familyCreatedAt, access, refresh, csrf, doc };
}
const cookieHeader = (s: { access?: string; refresh?: string; csrf?: string }) =>
    [s.access && `access=${s.access}`, s.refresh && `refresh=${s.refresh}`, s.csrf && `csrf=${s.csrf}`]
        .filter(Boolean).join('; ');
const getSetCookie = (res: any): string[] => {
    const raw = res.headers['set-cookie'] || [];
    return Array.isArray(raw) ? raw : [raw];
};
const cookieVal = (setCookies: string[], name: string): string | undefined => {
    const c = setCookies.find((x) => x.startsWith(name + '='));
    return c ? c.split(';')[0].split('=').slice(1).join('=') : undefined;
};

async function main() {
    await mongoose.connect(DB);
    await User.deleteMany({ email: /verify-refresh/ });
    await RefreshToken.deleteMany({});

    const user = await User.create({
        UserName: 'verifier', email: 'verify-refresh@test.local',
        walletAddress: '0x' + '1'.repeat(40), referralCode: 'VRF' + Date.now().toString(36),
    });
    const uid = user._id.toString();

    // 1. protect: valid access cookie → profile 200
    let s = await newSession(uid);
    let r = await request(app).get('/api/user/profile').set('Cookie', cookieHeader({ access: s.access }));
    ok('protect: valid access → 200 profile', r.status === 200 && r.body.email === user.email);

    // 2. protect: no token → 401
    r = await request(app).get('/api/user/profile');
    ok('protect: no token → 401', r.status === 401);

    // 3. CSRF: refresh WITHOUT csrf header → 403
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh }));
    ok('csrf: missing header → 403', r.status === 403);

    // 4. CSRF: header != cookie → 403
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf + 'tamper');
    ok('csrf: header≠cookie → 403', r.status === 403);

    // 5. CSRF: valid HMAC but WRONG fid (different session) → 403
    const other = issueCsrfToken(crypto.randomUUID());
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: other }))
        .set('X-CSRF-Token', other);
    ok('csrf: valid HMAC, wrong fid → 403', r.status === 403);

    // 6. Refresh happy path → 200 + rotates all three cookies
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    const sc = getSetCookie(r);
    const child = cookieVal(sc, 'refresh');
    const newAccess = cookieVal(sc, 'access');
    ok('refresh: happy path → 200', r.status === 200);
    ok('refresh: rotated refresh cookie issued', !!child && child !== s.refresh);
    ok('refresh: new access cookie issued', !!newAccess); // (may be byte-identical if <1s elapsed — same iat)
    ok('refresh: refresh cookie Path=/api/user', sc.some((c) => c.startsWith('refresh=') && /Path=\/api\/user/i.test(c)));
    ok('refresh: parent marked usedAt+replacedBy',
        !!(await RefreshToken.findOne({ tokenHash: (await import('./dist/utils/refreshToken.js')).hashToken(s.refresh) }))?.usedAt);

    // 7. Grace window: reuse the OLD (parent) token within grace → benign 200, access only, NO revoke
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    const graceSc = getSetCookie(r);
    ok('grace: reuse within window → 200', r.status === 200);
    ok('grace: no new refresh cookie (access only)', !cookieVal(graceSc, 'refresh') && !!cookieVal(graceSc, 'access'));
    const childRow1 = await RefreshToken.findOne({ tokenHash: (await import('./dist/utils/refreshToken.js')).hashToken(child!) });
    ok('grace: family NOT revoked (child still live)', !childRow1?.revokedAt);

    // 8. Reuse detection OUTSIDE grace: force parent.usedAt into the past → reuse → 401 + family revoked
    const { hashToken } = await import('./dist/utils/refreshToken.js');
    await RefreshToken.updateOne({ tokenHash: hashToken(s.refresh) },
        { $set: { usedAt: new Date(Date.now() - env.REFRESH_GRACE_MS - 5000) } });
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    ok('reuse: outside grace → 401 reuse_detected', r.status === 401 && r.body.message === 'reuse_detected');
    const childRow2 = await RefreshToken.findOne({ tokenHash: hashToken(child!) });
    ok('reuse: whole family revoked (child killed)', !!childRow2?.revokedAt);

    // 9. Absolute cap: familyCreatedAt far in the past → 401 absolute_cap
    s = await newSession(uid);
    await RefreshToken.updateOne({ tokenHash: hashToken(s.refresh) },
        { $set: { familyCreatedAt: new Date(Date.now() - env.REFRESH_ABSOLUTE_TTL_MS - 5000) } });
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    ok('absolute cap: expired family → 401 absolute_cap', r.status === 401 && r.body.message === 'absolute_cap');

    // 10. Logout revokes the family server-side → subsequent refresh → 401 revoked
    s = await newSession(uid);
    r = await request(app).post('/api/user/logout')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    ok('logout → 200', r.status === 200);
    r = await request(app).post('/api/user/refresh')
        .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
        .set('X-CSRF-Token', s.csrf);
    ok('logout: revoked token can no longer refresh → 401', r.status === 401 && r.body.message === 'revoked');

    // 11. Atomic single-spend under concurrency: fire N refreshes with the SAME token at once
    s = await newSession(uid);
    const N = 8;
    const reqs = Array.from({ length: N }, () =>
        request(app).post('/api/user/refresh')
            .set('Cookie', cookieHeader({ access: s.access, refresh: s.refresh, csrf: s.csrf }))
            .set('X-CSRF-Token', s.csrf));
    const results = await Promise.all(reqs);
    // A real rotation sets a NON-EMPTY refresh cookie (64 hex). clearCookie sets `refresh=;` — exclude it.
    const rotations = results.filter((x) => getSetCookie(x).some((c) => /^refresh=[a-f0-9]{64}/.test(c)));
    const revoked = await RefreshToken.findOne({ tokenHash: hashToken(s.refresh) });
    ok('concurrency: exactly ONE rotation among N', rotations.length === 1, `rotations=${rotations.length}/${N}`);
    ok('concurrency: no false reuse-revocation', !revoked?.revokedAt,
        `statuses=${results.map((x) => x.status).join(',')}`);

    console.log(`\n${fail === 0 ? '🎉' : '⚠️'} ${pass} passed, ${fail} failed`);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error('HARNESS ERROR', e); try { await mongoose.disconnect(); } catch {} process.exit(2); });
