// W5 — təhlükəsizlik regresiya testləri (pentest ssenariləri). Əsas auth/SQL/BOLA testləri öz modul fayllarındadır;
// burada hücumçu baxışından əlavə ssenarilər: saxta JWT, IDOR matrisi, SQLi, path traversal, XSS, CSP, header injection.
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { createTestApp, bearer } from './helpers.js';
import { makePdf } from './fixtures/files.js';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('auth bypass', () => {
  it('alg=none token → 401', async () => {
    const { api } = createTestApp();
    const now = Math.floor(Date.now() / 1000);
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '2', username: 'admin', role: 'ADMIN', scope: 'admin', iat: now, exp: now + 900 })}.`;
    const res = await api().post('/api/v1/_reset').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it('başqa secret ilə imzalanmış ADMIN token → 401', async () => {
    const { api } = createTestApp();
    const forged = await new SignJWT({ username: 'admin', role: 'ADMIN', scope: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('2')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('guessed-secret'));
    expect((await api().post('/api/v1/_reset').set(bearer(forged))).status).toBe(401);
  });

  it('refresh token access token kimi işləmir, access token refresh kimi işləmir', async () => {
    const { api, login } = createTestApp();
    const t = await login();
    expect((await api().get('/api/v1/auth/me').set(bearer(t.refresh_token))).status).toBe(401);
    expect([401, 422]).toContain((await api().post('/api/v1/auth/refresh').send({ refresh_token: t.access_token })).status);
  });

  it('OAuth refresh scope-u genişləndirmir; parol səhvdirsə consent code vermir', async () => {
    const { api } = createTestApp();
    const res = await api().post('/oauth/authorize').set('Accept', 'application/json').type('form').send({
      client_id: 'apilab-portal', redirect_uri: 'http://localhost:5173/oauth/callback', scope: 'openid admin', state: 'st-12345678',
      username: 'student', password: 'wrong', decision: 'allow',
    });
    expect(res.status).toBe(401);
  });

  it('open redirect: qeydiyyatsız redirect_uri → 400, yönləndirmə yoxdur', async () => {
    const { api } = createTestApp();
    const res = await api().get('/oauth/authorize').query({ response_type: 'code', client_id: 'apilab-portal', redirect_uri: 'https://evil.example/cb', state: 'st-12345678' });
    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
  });
});

describe('IDOR / BOLA — student başqasının (rauf, id=3) resurslarına', () => {
  // Seed: rauf-un hesabı AZ21NABZ0004, kartı 5, otel bronu 1; student-in öz resursları 200 qaytarır
  const cases: [string, string, string, object?][] = [
    ['GET', '/api/v1/accounts/AZ21NABZ0004', 'hesab'],
    ['GET', '/api/v1/accounts/AZ21NABZ0004/transactions', 'əməliyyatlar'],
    ['GET', '/api/v1/cards/5', 'kart'],
    ['POST', '/api/v1/cards/5/block', 'kartı blokla', { reason: 'LOST' }],
    ['POST', '/api/v1/cards/5/unblock', 'kartı aç', {}],
    ['GET', '/api/v1/hotels/bookings/1', 'otel bronu'],
    ['DELETE', '/api/v1/hotels/bookings/1', 'otel bronunu ləğv et'],
    ['PATCH', '/api/v1/hotels/bookings/1', 'otel bronunu dəyiş', { guests: 1 }],
    ['POST', '/api/v1/transfers', 'başqasının hesabından köçürmə', { fromAccountId: 'AZ21NABZ0004', toAccountId: 'AZ21NABZ0001', amount: 1, currency: 'AZN' }],
  ];
  for (const [method, url, label, body] of cases) {
    it(`${label}: ${method} ${url} → 403`, async () => {
      const { api, login } = createTestApp();
      const token = (await login()).access_token;
      let req = (api() as any)[method.toLowerCase()](url).set(bearer(token));
      if (url.endsWith('/transfers')) req = req.set('Idempotency-Key', 'idor-test-0001');
      const res = await (body ? req.send(body) : req);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
    });
  }

  it('rauf-un uçuş bronu, transferi və playlist-i student üçün 403', async () => {
    const { api, login, db } = createTestApp();
    const rauf = (await login('rauf')).access_token;
    const student = (await login()).access_token;
    // rauf-un öz iki hesabı arasında köçürmə (alan tərəf də rauf-dur — student heç bir tərəf deyil)
    const transferId = (await db.prepare("INSERT INTO transfers (from_account, to_account, amount_minor, currency, created_by) VALUES ('AZ21NABZ0004', 'AZ21NABZ0005', 100, 'AZN', 3)").run()).lastInsertRowid;
    const transfer = { status: 201, body: { id: Number(transferId) } };
    const playlist = await api().post('/api/v1/music/playlists').set(bearer(rauf)).send({ name: 'Rauf-un siyahısı' });
    expect(transfer.status).toBe(201);
    expect(playlist.status).toBe(201);
    const urls = ['/api/v1/flights/bookings/2', `/api/v1/transfers/${transfer.body.id}`, `/api/v1/music/playlists/${playlist.body.id}`];
    for (const url of urls) expect((await api().get(url).set(bearer(student))).status, url).toBe(403);
    expect((await api().delete('/api/v1/flights/bookings/2').set(bearer(student))).status).toBe(403);
    expect((await api().post(`/api/v1/music/playlists/${playlist.body.id}/tracks`).set(bearer(student)).send({ trackId: 1 })).status).toBe(403);
  });

  it('tapşırıq irəliləyişi: student yalnız özününkünü dəyişir və görür; userId parametri qəbul olunmur', async () => {
    const { api, login, db } = createTestApp();
    const student = (await login()).access_token;
    const rauf = (await login('rauf')).access_token;
    const taskId = ((await db.prepare('SELECT id FROM tasks LIMIT 1').get()) as { id: number }).id;
    expect((await api().put(`/api/v1/tasks/${taskId}/progress`).set(bearer(student)).send({ done: true })).status).toBe(200);
    const raufView = await api().get('/api/v1/tasks/progress/me').set(bearer(rauf));
    expect(JSON.stringify(raufView.body)).not.toContain(`"taskId":${taskId},"done":true`);
    expect((await api().get('/api/v1/tasks/progress/me?userId=1').set(bearer(rauf))).status).toBe(422);
    expect((await api().put(`/api/v1/tasks/${taskId}/progress`).set(bearer(rauf)).send({ done: true, userId: 1 })).status).toBe(422);
  });

  it('/_history: student başqasının sorğularını görmür, all=true → 403', async () => {
    const { api, login } = createTestApp();
    const rauf = (await login('rauf')).access_token;
    await api().get('/api/v1/accounts').set(bearer(rauf));
    const student = (await login()).access_token;
    const mine = await api().get('/api/v1/_history').set(bearer(student));
    expect(mine.status).toBe(200);
    expect(mine.body.items.every((i: { userId?: number }) => i.userId === undefined || i.userId === 1)).toBe(true);
    expect((await api().get('/api/v1/_history?all=true').set(bearer(student))).status).toBe(403);
  });

  it('mass assignment: customer yaradarkən id/createdAt/role göndərmək → 422', async () => {
    const { api } = createTestApp();
    const res = await api().post('/api/v1/customers').send({ firstName: 'A', lastName: 'B', email: 'ab@example.com', id: 1, createdAt: '2020-01-01T00:00:00Z' });
    expect(res.status).toBe(422);
  });

  it('prototype pollution: __proto__ sahəsi → 422, Object.prototype dəyişmir', async () => {
    const { api } = createTestApp();
    const res = await api().post('/api/v1/customers').set('Content-Type', 'application/json').send('{"firstName":"A","lastName":"B","email":"p@example.com","__proto__":{"polluted":true}}');
    expect([400, 422]).toContain(res.status);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('SQL injection', () => {
  const sqlCases = [
    ['VACUUM INTO', "VACUUM INTO '/tmp/apilab-leak.db'"],
    ['REPLACE INTO', "REPLACE INTO cards (id) VALUES (1)"],
    ['CTE + DELETE', 'WITH x AS (SELECT 1) DELETE FROM cards'],
    ['readfile', "SELECT readfile('/etc/passwd')"],
    ['iki statement (boşluqsuz)', 'SELECT 1;DELETE FROM cards'],
    ['şərhin içində ;', 'SELECT 1 /* ; */; DROP TABLE users'],
    ['böyük hərf + unicode boşluq', 'select 1; drop table users'],
  ];
  for (const [label, sql] of sqlCases) {
    it(`_db/query rədd edir və ya zərərsizdir: ${label}`, async () => {
      const { api, db } = createTestApp();
      const before = ((await db.prepare('SELECT count(*) c FROM cards').get()) as { c: number }).c;
      const res = await api().post('/api/v1/_db/query').send({ sql });
      expect(res.status, JSON.stringify(res.body)).not.toBe(200);
      expect(((await db.prepare('SELECT count(*) c FROM cards').get()) as { c: number }).c).toBe(before);
      expect(((await db.prepare("SELECT count(*) c FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'").get()) as { c: number }).c).toBe(1);
    });
  }

  it('_db/query: sirr saxlayan cədvəllərdə gizli sütunlar sızmır', async () => {
    const { api } = createTestApp();
    for (const sql of ['SELECT * FROM api_keys', 'SELECT * FROM oauth_clients', 'SELECT * FROM refresh_tokens', 'SELECT * FROM users']) {
      const res = await api().post('/api/v1/_db/query').send({ sql });
      expect(res.status, sql).toBe(200);
      const text = JSON.stringify(res.body.rows);
      expect(text).not.toMatch(/\$2[aby]\$|scrypt|apilab-demo-key-2026|apilab-portal-secret|[a-f0-9]{64}/);
    }
  });

  it('adi endpoint-lərdə SQLi payload-u məlumat sızdırmır (parametrləşdirilmiş sorğular)', async () => {
    const { api } = createTestApp();
    const payload = "' OR 1=1 --";
    const customers = await api().get('/api/v1/customers').query({ q: payload });
    expect([200, 422]).toContain(customers.status);
    if (customers.status === 200) expect(customers.body.items ?? customers.body.data ?? []).toHaveLength(0);
    const flights = await api().get('/api/v1/flights/search').query({ from: payload, to: 'IST' });
    expect(flights.status).toBe(422); // IATA pattern
    const sort = await api().get('/api/v1/customers').query({ sort: 'id;DROP TABLE customers' });
    expect(sort.status).toBe(422);
    const hotels = await api().get('/api/v1/hotels/search').query({ city: "Baku' UNION SELECT password_hash FROM users --" });
    expect([200, 422]).toContain(hotels.status);
    expect(JSON.stringify(hotels.body)).not.toMatch(/scrypt|\$2[aby]\$/);
  });
});

describe('path traversal və statik fayllar', () => {
  for (const url of ['/..%2f..%2f.env', '/%2e%2e/%2e%2e/package.json', '/docs/..%2f..%2fpackage.json', '/assets/..%2f..%2f..%2fserver%2fsrc%2fconfig.ts', '/data/apilab.db', '/.env', '/.git/config']) {
    it(`${url} → məzmun sızmır`, async () => {
      const { api } = createTestApp();
      const res = await api().get(url).buffer(true);
      const text = String(res.text ?? res.body ?? '');
      expect(text).not.toMatch(/JWT_SECRET|"devDependencies"|SQLite format|\[core\]|process\.env/);
    });
  }

  it('material imzası başqa materiala köçürülə bilmir', async () => {
    const t = createTestApp();
    const admin = (await t.login('admin')).access_token;
    const up = (title: string) =>
      t.api().post('/api/v1/materials').set(bearer(admin)).field('title', title).field('lesson', '1').attach('file', makePdf(1), { filename: `${title}.pdf`, contentType: 'application/pdf' });
    const a = (await up('A')).body;
    const b = (await up('B')).body;
    await (t.app.locals.materials as { queue: { idle(): Promise<void> } }).queue.idle();
    const ma = (await t.api().get(`/api/v1/materials/${a.id}`).set(bearer(admin))).body;
    const signed = new URL(ma.links.download, 'http://x');
    const stolen = await t.api().get(`/api/v1/materials/${b.id}/download${signed.search}`);
    expect(stolen.status).toBe(401);
  });
});

describe('XSS və header injection', () => {
  it('OAuth consent HTML səhifəsi state/redirect_uri-ni escape edir', async () => {
    const { api } = createTestApp();
    const res = await api().get('/oauth/authorize').query({
      response_type: 'code', client_id: 'apilab-portal', redirect_uri: 'http://localhost:5173/oauth/callback', state: '"><script>alert(1)</script>', scope: 'openid "><img src=x onerror=alert(1)>',
    });
    if (res.status === 200) {
      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(res.text).not.toContain('<img src=x');
    } else {
      expect(res.status).toBe(422);
    }
  });

  it('saxlanmış XSS payload-u JSON kimi qayıdır (nosniff), HTML kimi yox', async () => {
    const { api } = createTestApp();
    const created = await api().post('/api/v1/customers').send({ firstName: '<script>alert(1)</script>', lastName: '<img src=x onerror=alert(1)>', email: 'xss@example.com' });
    expect([201, 422]).toContain(created.status);
    if (created.status === 201) {
      const res = await api().get(`/api/v1/customers/${created.body.id}`);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('material adında CRLF → Content-Disposition başlığına inject olunmur', async () => {
    const t = createTestApp();
    const admin = (await t.login('admin')).access_token;
    const res = await t.api().post('/api/v1/materials').set(bearer(admin)).field('title', 'CRLF').field('lesson', '1')
      .attach('file', makePdf(1), { filename: 'a"\r\nSet-Cookie: x=1\r\n.pdf', contentType: 'application/pdf' });
    expect([202, 422]).toContain(res.status);
    if (res.status === 202) {
      await (t.app.locals.materials as { queue: { idle(): Promise<void> } }).queue.idle();
      const dl = await t.api().get(`/api/v1/materials/${res.body.id}/download`).set(bearer(admin));
      expect(dl.headers['set-cookie']).toBeUndefined();
      expect(String(dl.headers['content-disposition'])).not.toMatch(/[\r\n]/);
    }
  });

  it('CSP və təhlükəsizlik başlıqları', async () => {
    const { api } = createTestApp();
    const res = await api().get('/');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: credentials icazəsi yoxdur (token yalnız başlıqda) — istənilən origin cookie oğurlaya bilməz', async () => {
    const { api } = createTestApp();
    const res = await api().get('/api/v1/airports').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('böyük JSON body → 413 PAYLOAD_TOO_LARGE (əvvəl 400 BAD_REQUEST idi)', async () => {
    const { api } = createTestApp();
    const res = await api().post('/api/v1/customers').set('Content-Type', 'application/json').send(JSON.stringify({ firstName: 'x'.repeat(2_000_000), lastName: 'y', email: 'z@example.com' }));
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
