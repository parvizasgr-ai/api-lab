// W5 QA Medium/Low düzəlişlərinin backend regresiya testləri (ID-lər docs/qa/W5-report.md-dəndir).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { corsOriginAllowed } from '../server/src/middleware/security.js';
import { createTestApp, bearer, expectMatchesSpec } from './helpers.js';

describe('QA-M10: trust proxy yalnız TRUSTED_PROXIES-dən', () => {
  it('default (loopback): loopback proxy-nin X-Forwarded-For-u qəbul olunur, başqa ünvanlara etibar yoxdur', () => {
    const { app } = createTestApp();
    const trust = app.get('trust proxy fn') as (addr: string, i: number) => boolean;
    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('::1', 0)).toBe(true);
    expect(trust('10.0.0.5', 0)).toBe(false);
    expect(trust('203.0.113.7', 0)).toBe(false);
  });

  it('TRUSTED_PROXIES=none: X-Forwarded-For heç nəzərə alınmır — saxta IP ilə anonim limitdən qaçmaq olmur', async () => {
    const { api, db } = createTestApp({ config: { trustedProxies: false, rateLimit: { limit: 3, windowSec: 60 } } });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await api().get('/api/v1/airports').set('X-Forwarded-For', `198.51.100.${i}`)).status);
    expect(statuses.slice(3)).toEqual([429, 429]);
    const ips = db.prepare('SELECT DISTINCT ip FROM request_log').pluck().all() as string[];
    expect(ips.some((ip) => ip.startsWith('198.51.100.'))).toBe(false);
  });

  it('konkret proxy siyahısı: yalnız siyahıdakı ünvana etibar olunur', () => {
    const { app } = createTestApp({ config: { trustedProxies: ['10.0.0.0/8'] } });
    const trust = app.get('trust proxy fn') as (addr: string, i: number) => boolean;
    expect(trust('10.1.2.3', 0)).toBe(true);
    expect(trust('127.0.0.1', 0)).toBe(false);
  });
});

describe('QA-L05: login brute-force — username üzrə kilid', () => {
  it('N uğursuz cəhddən sonra düzgün parol da 429 + Retry-After alır; pəncərə bitəndə açılır; başqa istifadəçiyə təsir etmir', async () => {
    const { api, clock } = createTestApp({ config: { loginLockout: { maxFailures: 3, windowSec: 300 } } });
    for (let i = 0; i < 3; i++) expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: `wrong${i}` })).status).toBe(401);
    const locked = await api().post('/api/v1/auth/login').send({ username: 'ADMIN', password: 'admin123' });
    expect(locked.status).toBe(429);
    expectMatchesSpec(locked, 'authLogin');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await api().post('/api/v1/auth/login').send({ username: 'student', password: 'student123' })).status).toBe(200);
    clock.advance(300);
    expect((await api().post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).status).toBe(200);
  });

  it('uğurlu login sayğacı sıfırlayır', async () => {
    const { api, db } = createTestApp({ config: { loginLockout: { maxFailures: 3, windowSec: 300 } } });
    for (let i = 0; i < 2; i++) await api().post('/api/v1/auth/login').send({ username: 'rauf', password: 'x' });
    expect((await api().post('/api/v1/auth/login').send({ username: 'rauf', password: 'rauf123' })).status).toBe(200);
    expect(db.prepare("SELECT count(*) FROM rate_limit_counters WHERE subject = 'login-fail:rauf'").pluck().get()).toBe(0);
  });
});

describe('QA-L06: pre-signed imza loglara düşmür', () => {
  it('request_log.path query-siz yazılır (exp/sig saxlanmır)', async () => {
    const { api, db } = createTestApp();
    await api().get('/api/v1/materials/1/download?exp=9999999999&sig=' + 'a'.repeat(64));
    const paths = db.prepare('SELECT path FROM request_log').pluck().all() as string[];
    expect(paths).toContain('/api/v1/materials/1/download');
    expect(paths.join(' ')).not.toContain('sig=');
  });
});

describe('QA-L07: CORS allowlist', () => {
  const cfg = (corsOrigins: string[]) => ({ corsOrigins, publicUrl: 'http://localhost:3000' });
  it('default: localhost/127.0.0.1 istənilən port və Origin-siz sorğular; xarici origin yox', () => {
    expect(corsOriginAllowed(undefined, cfg([]))).toBe(true);
    expect(corsOriginAllowed('http://localhost:5173', cfg([]))).toBe(true);
    expect(corsOriginAllowed('http://127.0.0.1:8080', cfg([]))).toBe(true);
    expect(corsOriginAllowed('https://evil.example', cfg([]))).toBe(false);
    expect(corsOriginAllowed('http://localhost.evil.example', cfg([]))).toBe(false);
  });
  it('CORS_ORIGINS siyahısı və *', () => {
    expect(corsOriginAllowed('https://lab.unec.edu.az', cfg(['https://lab.unec.edu.az']))).toBe(true);
    expect(corsOriginAllowed('http://localhost:5173', cfg(['https://lab.unec.edu.az']))).toBe(false);
    expect(corsOriginAllowed('https://any.example', cfg(['*']))).toBe(true);
  });
  it('HTTP: xarici origin-ə Access-Control-Allow-Origin verilmir, localhost-a verilir', async () => {
    const { api } = createTestApp();
    expect((await api().get('/api/v1/airports').set('Origin', 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
    expect((await api().get('/api/v1/airports').set('Origin', 'http://localhost:5173')).headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('QA-L08: logout access token-i də ləğv edir', () => {
  it('logout-dan sonra həmin access token 401, yeni login token-i işləyir; jti unikaldır', async () => {
    const { api, login, db } = createTestApp();
    const t = await login();
    const other = await login(); // eyni istifadəçinin ikinci sessiyası
    expect((await api().get('/api/v1/auth/me').set(bearer(t.access_token))).status).toBe(200);
    expect((await api().post('/api/v1/auth/logout').set(bearer(t.access_token)).send({ refresh_token: t.refresh_token })).status).toBe(204);
    const after = await api().get('/api/v1/auth/me').set(bearer(t.access_token));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('INVALID_TOKEN');
    expect((await api().get('/api/v1/auth/me').set(bearer(other.access_token))).status).toBe(200);
    expect(db.prepare('SELECT count(*) FROM revoked_access_tokens').pluck().get()).toBe(1);
    const jti = (tok: string) => JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).jti;
    expect(jti(t.access_token)).not.toBe(jti(other.access_token));
  });

  it('vaxtı keçmiş denylist sətirləri növbəti logout-da təmizlənir', async () => {
    const { api, login, db, clock } = createTestApp();
    const a = await login();
    await api().post('/api/v1/auth/logout').set(bearer(a.access_token)).send({ refresh_token: a.refresh_token });
    clock.advance(16 * 60);
    const b = await login();
    await api().post('/api/v1/auth/logout').set(bearer(b.access_token)).send({ refresh_token: b.refresh_token });
    expect(db.prepare('SELECT count(*) FROM revoked_access_tokens').pluck().get()).toBe(1);
  });
});

describe('QA-L09: PATCH null telefonu/şəhəri silir', () => {
  it('phone: null → null; göndərilməyən sahə dəyişmir; səhv format 422', async () => {
    const { api } = createTestApp();
    const c = await api().post('/api/v1/customers').send({ firstName: 'Rəna', lastName: 'Quliyeva', email: 'rena.l09@example.az', phone: '+994501112233', city: 'Gəncə' });
    const res = await api().patch(`/api/v1/customers/${c.body.id}`).send({ phone: null });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'patchCustomer');
    expect(res.body).toMatchObject({ phone: null, city: 'Gəncə' });
    expect((await api().patch(`/api/v1/customers/${c.body.id}`).send({ phone: '050' })).status).toBe(422);
  });
});

describe('QA-M04: SPA fallback — real URL-lər portalın index.html-ini qaytarır', () => {
  it('/explorer, /apps/bank, /sql, /materials, /signin → index.html; API yolları JSON 404 olaraq qalır', async () => {
    const ctx = createTestApp();
    fs.writeFileSync(path.join(ctx.config.webDist, 'index.html'), '<!doctype html><div id="root"></div>');
    for (const url of ['/', '/explorer', '/apps/bank', '/auth', '/sql', '/materials', '/signin']) {
      const res = await ctx.api().get(url).set('Accept', 'text/html');
      expect(res.status, url).toBe(200);
      expect(res.text, url).toContain('<div id="root">');
    }
    const api404 = await ctx.api().get('/api/v1/nope').set('Accept', 'text/html');
    expect(api404.status).toBe(404);
    expect(api404.headers['content-type']).toMatch(/json/);
  });
});
