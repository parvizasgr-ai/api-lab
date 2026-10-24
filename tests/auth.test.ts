// Auth: login, JWT, 401 vs 403, expired token, refresh rotation, logout, API key, Basic.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

describe('login', () => {
  const t = createTestApp();

  it('200 — access + refresh token, cavab spec-ə uyğundur', async () => {
    const res = await t.api().post('/api/v1/auth/login').send({ username: 'student', password: 'student123' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'authLogin');
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(900);
    expect(res.body.scope).toContain('cards:write');
    expect(res.headers['cache-control']).toBe('no-store');
    // Refresh token DB-də açıq saxlanmır — yalnız hash
    const stored = await t.db.prepare(`SELECT token_hash FROM refresh_tokens ORDER BY id DESC LIMIT 1`).pluck().get();
    expect(stored).not.toBe(res.body.refresh_token);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uğurlu login request_log-da user_id ilə yazılır, uğursuz — user_id olmadan', async () => {
    await t.api().post('/api/v1/auth/login').set('X-Request-Id', 'login-ok-1').send({ username: 'rauf', password: 'rauf123' });
    await t.api().post('/api/v1/auth/login').set('X-Request-Id', 'login-fail-1').send({ username: 'rauf', password: 'wrong-pass' });
    const userOf = (id: string) => t.db.prepare(`SELECT user_id FROM request_log WHERE request_id = ?`).pluck().get(id);
    expect(await userOf('login-ok-1')).toBe(3);
    expect(await userOf('login-fail-1')).toBeNull();
  });

  it('JWT claim-ləri: sub, username, role, scope, exp = iat + 15 dəq', async () => {
    const { access_token } = await t.login();
    const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ sub: '1', username: 'student', role: 'USER' });
    expect(payload.exp - payload.iat).toBe(900);
    expect(JSON.parse(Buffer.from(access_token.split('.')[0], 'base64url').toString()).alg).toBe('HS256');
  });

  it('401 INVALID_CREDENTIALS — səhv parol və naməlum istifadəçi eyni cavabı alır', async () => {
    const wrong = await t.api().post('/api/v1/auth/login').send({ username: 'student', password: 'wrongpass' });
    const unknown = await t.api().post('/api/v1/auth/login').send({ username: 'nobody', password: 'wrongpass' });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expectMatchesSpec(res, 'authLogin');
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrong.body.message).toBe(unknown.body.message);
  });
});

describe('401 vs 403', () => {
  const t = createTestApp();

  it('token yoxdur → 401 UNAUTHORIZED + WWW-Authenticate', async () => {
    const res = await t.api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expectMatchesSpec(res, 'authMe');
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });

  it('saxta token → 401 INVALID_TOKEN', async () => {
    const res = await t.api().get('/api/v1/auth/me').set(bearer('abc.def.ghi'));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('imzası dəyişdirilmiş token → 401 INVALID_TOKEN', async () => {
    const { access_token } = await t.login();
    const [h, p] = access_token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'ADMIN' })).toString('base64url');
    const res = await t.api().get('/api/v1/auth/me').set(bearer(`${h}.${forgedPayload}.${access_token.split('.')[2]}`));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('vaxtı keçmiş token → 401 TOKEN_EXPIRED', async () => {
    const token = await t.auth.issueAccessToken({ id: 1, username: 'student', role: 'USER' }, ['cards:read'], {
      now: new Date(t.clock.now.getTime() - 16 * 60 * 1000),
    });
    const res = await t.api().get('/api/v1/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    expect(res.headers['www-authenticate']).toContain('invalid_token');
  });

  it('token 15 dəqiqədən sonra etibarsız olur', async () => {
    const { access_token } = await t.login();
    expect((await t.api().get('/api/v1/auth/me').set(bearer(access_token))).status).toBe(200);
    t.clock.advance(15 * 60 + 1);
    const res = await t.api().get('/api/v1/auth/me').set(bearer(access_token));
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('scope çatışmır → 403 INSUFFICIENT_SCOPE (rauf-un cards:write-i yoxdur)', async () => {
    const tt = createTestApp();
    const { access_token } = await tt.login('rauf');
    const res = await tt.api().post('/api/v1/cards/5/block').set(bearer(access_token)).send({ reason: 'LOST' });
    expect(res.status).toBe(403);
    expectMatchesSpec(res, 'blockCard');
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE');
    expect(res.body.details[0].message).toContain('cards:write');
  });

  it('ADMIN olmayan → 403 (_reset)', async () => {
    const tt = createTestApp();
    const { access_token } = await tt.login('student');
    const res = await tt.api().post('/api/v1/_reset').set(bearer(access_token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('/auth/me — 200, spec-ə uyğun', async () => {
    const { access_token } = await t.login();
    const res = await t.api().get('/api/v1/auth/me').set(bearer(access_token));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'authMe');
    expect(res.body).toMatchObject({ id: 1, username: 'student', role: 'USER' });
  });
});

describe('refresh token rotation + logout', () => {
  let t: ReturnType<typeof createTestApp>;
  beforeEach(() => {
    t = createTestApp();
  });

  it('refresh yeni cüt qaytarır, köhnə refresh token artıq işləmir', async () => {
    const first = await t.login();
    const res = await t.api().post('/api/v1/auth/refresh').send({ refresh_token: first.refresh_token });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'authRefresh');
    expect(res.body.refresh_token).not.toBe(first.refresh_token);

    const reuse = await t.api().post('/api/v1/auth/refresh').send({ refresh_token: first.refresh_token });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('ləğv edilmiş token təkrar gələrsə (oğurlanma şübhəsi) bütün refresh token-lər ləğv olunur', async () => {
    const first = await t.login();
    const second = (await t.api().post('/api/v1/auth/refresh').send({ refresh_token: first.refresh_token })).body;
    await t.api().post('/api/v1/auth/refresh').send({ refresh_token: first.refresh_token }); // reuse
    const res = await t.api().post('/api/v1/auth/refresh').send({ refresh_token: second.refresh_token });
    expect(res.status).toBe(401);
    const active = await t.db.prepare(`SELECT COUNT(*) FROM refresh_tokens WHERE user_id = 1 AND revoked_at IS NULL`).pluck().get();
    expect(active).toBe(0);
  });

  it('refresh token 7 gündən sonra etibarsızdır', async () => {
    const { refresh_token } = await t.login();
    t.clock.advance(7 * 24 * 3600 + 1);
    const res = await t.api().post('/api/v1/auth/refresh').send({ refresh_token });
    expect(res.status).toBe(401);
  });

  it('logout → 204, sonra refresh işləmir', async () => {
    const { access_token, refresh_token } = await t.login();
    const res = await t.api().post('/api/v1/auth/logout').set(bearer(access_token)).send({ refresh_token });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const after = await t.api().post('/api/v1/auth/refresh').send({ refresh_token });
    expect(after.status).toBe(401);
    const revoked = await t.db.prepare(`SELECT revoked_at FROM refresh_tokens WHERE user_id = 1`).pluck().get();
    expect(revoked).not.toBeNull();
  });
});

describe('API Key və Basic Auth', () => {
  const t = createTestApp({
    handlers: { listCurrencies: (req, res) => res.json({ items: [], via: req.auth?.via, userId: req.auth?.userId }) },
  });

  it('API key yoxdur → 401 UNAUTHORIZED', async () => {
    const res = await t.api().get('/api/v1/currencies');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('deaktiv API key → 401 INVALID_API_KEY', async () => {
    const res = await t.api().get('/api/v1/currencies').set('X-API-Key', 'apilab-revoked-key-2025');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_API_KEY');
  });

  it('düzgün API key → handler-ə çatır', async () => {
    const res = await t.api().get('/api/v1/currencies').set('X-API-Key', 'apilab-demo-key-2026');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ via: 'apiKey', userId: 1 });
  });

  it('Basic Auth — düzgün, səhv, yoxdur', async () => {
    const ok = await t.api().get('/api/v1/auth/basic-demo').auth('student', 'student123');
    expect(ok.status).toBe(200);
    expectMatchesSpec(ok, 'authBasicDemo');
    expect(ok.body.decodedHeader).toBe('student:********');

    const wrong = await t.api().get('/api/v1/auth/basic-demo').auth('student', 'nope');
    expect(wrong.status).toBe(401);
    expect(wrong.headers['www-authenticate']).toContain('Basic');

    const missing = await t.api().get('/api/v1/auth/basic-demo');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toContain('Basic');
  });
});
