// Qeydiyyat: validasiya (sxem + server qaydaları), təkrar username, sandbox data, avtomatik login, məxfilik.
import { describe, expect, it } from 'vitest';
import { createTestApp, bearer, expectMatchesSpec } from './helpers.js';
import { COMMON_PASSWORDS, passwordProblems } from '../server/src/modules/auth/register.js';

const VALID = { firstName: 'Nərmin', lastName: 'Quliyeva', groupName: 'BA-2026-A', username: 'nermin.q', password: 'Gizli-Parol-77' };
const register = (t: ReturnType<typeof createTestApp>, body: Record<string, unknown>) => t.api().post('/api/v1/auth/register').send(body);

describe('POST /api/v1/auth/register', () => {
  it('201 + tokenlər; /auth/me ad, soyad, qrup; parol hash-lənib; sandbox: 2 hesab, 2 kart, balans = əməliyyatlar', async () => {
    const t = createTestApp();
    const res = await register(t, VALID);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expectMatchesSpec(res, 'authRegister');
    expect(res.headers.location).toBe('/api/v1/auth/me');
    expect(res.body.scope).not.toContain('admin');

    const me = await t.api().get('/api/v1/auth/me').set(bearer(res.body.access_token));
    expect(me.status).toBe(200);
    expectMatchesSpec(me, 'authMe');
    expect(me.body).toMatchObject({ username: 'nermin.q', firstName: 'Nərmin', lastName: 'Quliyeva', groupName: 'BA-2026-A', fullName: 'Nərmin Quliyeva', role: 'USER', email: null });

    const row = (await t.db.prepare(`SELECT password_hash, last_login_at FROM users WHERE username = 'nermin.q'`).get()) as { password_hash: string; last_login_at: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(VALID.password);
    expect(row.last_login_at).not.toBeNull();

    const accounts = await t.api().get('/api/v1/accounts').set(bearer(res.body.access_token));
    expect(accounts.body.items.map((a: { currency: string; balance: number }) => `${a.currency}:${a.balance}`).sort()).toEqual(['AZN:1000', 'USD:500']);
    const cards = await t.api().get('/api/v1/cards').set(bearer(res.body.access_token));
    expect(cards.body.items).toHaveLength(2);
    // Balans uzlaşması (db/queries/02) yeni hesablar üçün də pozulmur
    const fs = await import('node:fs');
    expect(await t.db.prepare(fs.readFileSync('db/queries/02_balance_reconciliation.sql', 'utf8')).all()).toEqual([]);
  });

  it('yeni tələbə öz sandbox-u ilə dərsləri edə bilir: köçürmə və kartı blokla; başqasının hesabı 403', async () => {
    const t = createTestApp();
    const token = (await register(t, VALID)).body.access_token;
    const accounts = (await t.api().get('/api/v1/accounts').set(bearer(token))).body.items as { id: string; currency: string }[];
    const azn = accounts.find((a) => a.currency === 'AZN')!;
    const transfer = await t.api().post('/api/v1/transfers').set(bearer(token)).set('Idempotency-Key', 'reg-transfer-0001').send({ fromAccountId: azn.id, toAccountId: 'AZ21NABZ0004', amount: 10, currency: 'AZN' });
    expect(transfer.status).toBe(201);
    const card = (await t.api().get('/api/v1/cards').set(bearer(token))).body.items[0];
    expect((await t.api().post(`/api/v1/cards/${card.id}/block`).set(bearer(token)).send({ reason: 'LOST' })).status).toBe(200);
    expect((await t.api().get('/api/v1/accounts/AZ21NABZ0001').set(bearer(token))).status).toBe(403);
  });

  it('login yeni hesabla işləyir; təkrar username → 409 USERNAME_TAKEN', async () => {
    const t = createTestApp();
    await register(t, VALID);
    expect((await t.api().post('/api/v1/auth/login').send({ username: 'nermin.q', password: VALID.password })).status).toBe(200);
    const dup = await register(t, { ...VALID, firstName: 'Başqa' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('USERNAME_TAKEN');
    expectMatchesSpec(dup, 'authRegister');
    expect((await register(t, { ...VALID, username: 'student' })).body.code).toBe('USERNAME_TAKEN');
  });

  const formatCases: [string, Record<string, unknown>, string][] = [
    ['parol 7 simvol', { password: 'Abc-123' }, '/password'],
    ['parol 65 simvol', { password: 'x'.repeat(65) }, '/password'],
    ['username böyük hərf', { username: 'Nermin' }, '/username'],
    ['username 2 simvol', { username: 'nq' }, '/username'],
    ['username boşluq', { username: 'nermin q' }, '/username'],
    ['username nöqtə ilə başlayır', { username: '.nermin' }, '/username'],
    ['username kiril', { username: 'нермин' }, '/username'],
    ['ad rəqəm', { firstName: 'N3rmin' }, '/firstName'],
    ['ad 1 hərf', { firstName: 'N' }, '/firstName'],
    ['soyad tire ilə bitir', { lastName: 'Quliyeva-' }, '/lastName'],
    ['soyad HTML', { lastName: '<b>Q</b>' }, '/lastName'],
    ['qrup 1 simvol', { groupName: 'A' }, '/groupName'],
    ['qrup 31 simvol', { groupName: 'A'.repeat(31) }, '/groupName'],
    ['qrup xüsusi simvol', { groupName: 'BA;DROP' }, '/groupName'],
    ['naməlum sahə (role)', { role: 'ADMIN' }, '/role'],
  ];
  for (const [label, patch, field] of formatCases) {
    it(`422 format: ${label}`, async () => {
      const t = createTestApp();
      const res = await register(t, { ...VALID, ...patch });
      expect(res.status, JSON.stringify(res.body)).toBe(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });
  }

  it('məcburi sahələr: hər biri olmadan 422', async () => {
    const t = createTestApp();
    for (const key of Object.keys(VALID)) {
      const body: Record<string, unknown> = { ...VALID };
      delete body[key];
      const res = await register(t, body);
      expect(res.status, key).toBe(422);
    }
  });

  it('Azərbaycan hərfləri, tire, apostrof, boşluq qəbul olunur; boşluqlar normallaşdırılır', async () => {
    const t = createTestApp();
    const res = await register(t, { firstName: 'Gülşən', lastName: "Əhmədova-O'Neil", groupName: 'IT BA 2', username: 'gulsen_2026', password: 'Uzun-parol-2026' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('422 WEAK_PASSWORD: yayılmış parol, username/adla eyni, təkrar simvol; ehtiyatdakı username 422', async () => {
    const t = createTestApp();
    for (const password of ['12345678', 'Password', 'nermin.q', 'aaaaaaaa', 'Quliyeva2026']) {
      const res = await register(t, { ...VALID, password });
      expect(res.status, password).toBe(422);
      expect(res.body.code, password).toBe('WEAK_PASSWORD');
      expectMatchesSpec(res, 'authRegister');
    }
    const reserved = await register(t, { ...VALID, username: 'admin' });
    expect(reserved.status).toBe(422);
    expect(reserved.body.details[0].field).toBe('/username');
    expect(await t.db.prepare(`SELECT COUNT(*) FROM users`).pluck().get()).toBe(3); // heç nə yazılmayıb
  });

  it('passwordProblems unit + siyahı', () => {
    expect(passwordProblems('Gizli-Parol-77', VALID)).toEqual([]);
    expect(passwordProblems('nermin.q', VALID)).toContain('Parol username ilə eyni ola bilməz');
    expect(COMMON_PASSWORDS.has('student123')).toBe(true);
  });

  it('IP üzrə limit: dəqiqədə 10 qeydiyyat, 11-ci → 429', async () => {
    const t = createTestApp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await register(t, { ...VALID, username: `telebe${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('paralel qeydiyyatlar: hesab nömrələri toqquşmur, eyni username yalnız bir dəfə', async () => {
    const t = createTestApp();
    const results = await Promise.all([0, 1, 2, 3].map((i) => register(t, { ...VALID, username: `paralel${i}` })));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    const ids = (await t.db.prepare(`SELECT id FROM accounts WHERE owner_id > 3 ORDER BY id`).pluck().all()) as string[];
    expect(new Set(ids).size).toBe(8);
    const same = await Promise.all([0, 1].map(() => register(t, { ...VALID, username: 'eyni.ad' })));
    expect(same.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('məxfilik: mock Google hesab siyahısında qeydiyyatlı tələbələr görünmür', async () => {
    const t = createTestApp();
    await register(t, VALID);
    const res = await t.api().get('/oauth/authorize').set('Accept', 'application/json').query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: 'http://localhost:5173/oauth/callback', state: 'st-12345678' });
    expect(res.body.accounts.map((a: { username: string }) => a.username)).toEqual(['student', 'admin', 'rauf']);
  });
});
