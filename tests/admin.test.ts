// /health, /_history, /_reset, OpenAPI və Postman endpoint-ləri.
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

describe('health + openapi', () => {
  const t = createTestApp();
  it('spec-dəki hər endpoint-in handler-i var — 501 qaytaran endpoint yoxdur', () => {
    const pending: string[] = [];
    expect(t.app.locals.unimplemented).toEqual(pending);
  });
  it('GET /health', async () => {
    const res = await t.api().get('/api/v1/health');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'health');
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', version: '1.0.0' });
  });
  it('GET /api/openapi.json', async () => {
    const res = await t.api().get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });
});

describe('/_history', () => {
  it('yalnız cari istifadəçinin sorğuları; anonim — öz IP-sinin anonim sorğuları; all=true yalnız ADMIN', async () => {
    const t = createTestApp();
    const student = (await t.login('student')).access_token;
    const rauf = (await t.login('rauf')).access_token;
    await t.api().get('/api/v1/cards').set(bearer(student));
    await t.api().get('/api/v1/cards').set(bearer(rauf)).set('X-Request-Id', 'rauf-cards-1');
    await t.api().get('/api/v1/health').set('X-Request-Id', 'anon-health-1');

    const mine = await t.api().get('/api/v1/_history').set(bearer(student));
    expect(mine.status).toBe(200);
    expectMatchesSpec(mine, 'requestHistory');
    const ids = mine.body.items.map((i: { requestId: string }) => i.requestId);
    expect(ids).not.toContain('rauf-cards-1');
    expect(ids).not.toContain('anon-health-1');
    expect(mine.body.items.some((i: { route: string }) => i.route === '/api/v1/cards')).toBe(true);
    // Ən yenisi birinci, login sorğusu da (user_id ilə) daxildir
    expect(mine.body.items.at(-1).path).toBe('/api/v1/auth/login');

    const anon = await t.api().get('/api/v1/_history');
    expect(anon.body.items.map((i: { requestId: string }) => i.requestId)).toContain('anon-health-1');
    expect(anon.body.items.map((i: { requestId: string }) => i.requestId)).not.toContain('rauf-cards-1');

    const denied = await t.api().get('/api/v1/_history?all=true').set(bearer(student));
    expect(denied.status).toBe(403);
    expectMatchesSpec(denied, 'requestHistory');
    const admin = (await t.login('admin')).access_token;
    const all = await t.api().get('/api/v1/_history?all=true&limit=200').set(bearer(admin));
    expect(all.body.items.map((i: { requestId: string }) => i.requestId)).toEqual(expect.arrayContaining(['rauf-cards-1', 'anon-health-1']));
  });
});

describe('/_reset', () => {
  it('ADMIN DB-ni seed vəziyyətinə qaytarır; sonrakı sorğular normal işləyir', async () => {
    const t = createTestApp();
    const student = (await t.login('student')).access_token;
    await t.api().post('/api/v1/cards/1/block').set(bearer(student)).send({ reason: 'LOST' });
    await t.api().delete('/api/v1/customers/1');
    expect(t.db.prepare(`SELECT status FROM cards WHERE id = 1`).pluck().get()).toBe('BLOCKED');

    expect((await t.api().post('/api/v1/_reset')).status).toBe(401);
    expect((await t.api().post('/api/v1/_reset').set(bearer(student))).status).toBe(403);

    const admin = (await t.login('admin')).access_token;
    const res = await t.api().post('/api/v1/_reset').set(bearer(admin));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'adminReset');
    expect(res.body.tables).toMatchObject({ customers: 25, cards: 7, card_status_history: 2 });
    expect(t.db.prepare(`SELECT status FROM cards WHERE id = 1`).pluck().get()).toBe('ACTIVE');

    // Sxem yenidən yaradılıb — rate limit, request_log, auth yenə işləyir; köhnə JWT etibarlıdır (stateless)
    const after = await t.api().get('/api/v1/cards').set(bearer(student));
    expect(after.status).toBe(200);
    expect(after.headers['x-ratelimit-remaining']).toBeDefined();
    expect(t.db.prepare(`SELECT COUNT(*) FROM request_log`).pluck().get()).toBeGreaterThan(0);
  });
});

describe('Postman', () => {
  const t = createTestApp();

  it('collection: v2.1, tag-lar qovluq, bütün endpoint-lər, login token script-i', async () => {
    const res = await t.api().get('/api/postman/collection.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('api-lab.postman_collection.json');
    const c = res.body;
    expect(c.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    expect(c.item.map((f: { name: string }) => f.name)).toContain('Cards');
    expect(c.item.reduce((n: number, f: { item: unknown[] }) => n + f.item.length, 0)).toBe(102);

    const auth = c.item.find((f: { name: string }) => f.name === 'Auth');
    const login = auth.item.find((i: { name: string }) => i.name.startsWith('POST /api/v1/auth/login'));
    expect(login.event[0].script.exec.join('\n')).toContain("pm.environment.set('token'");
    expect(login.request.auth.type).toBe('noauth');

    const block = c.item.find((f: { name: string }) => f.name === 'Cards').item.find((i: { name: string }) => i.name.includes('/block'));
    expect(block.request.url.raw).toBe('{{baseUrl}}/api/v1/cards/:cardId/block');
    expect(block.request.url.variable).toEqual([{ key: 'cardId', value: '1' }]);
    expect(block.request.auth.bearer[0].value).toBe('{{token}}');
    expect(block.request.header).toContainEqual({ key: 'Idempotency-Key', value: '{{$guid}}', disabled: false });

    const rates = c.item.find((f: { name: string }) => f.name === 'Currencies').item.find((i: { name: string }) => i.name.includes('/rates'));
    expect(rates.request.auth.type).toBe('apikey');

    // External APIs: açar environment dəyişənindən — kolleksiyada real/nümunə açar yoxdur
    const external = c.item.find((f: { name: string }) => f.name === 'External APIs');
    expect(external.item).toHaveLength(12);
    const joke = external.item.find((i: { name: string }) => i.name.includes('/joke/'));
    expect(joke.request.header).toContainEqual({ key: 'X-RapidAPI-Key', value: '{{rapidApiKey}}', disabled: false });
    expect(JSON.stringify(c)).not.toContain('your-own-rapidapi-key');
  });

  it('environment: baseUrl, token, refreshToken, apiKey, rapidApiKey (boş)', async () => {
    const res = await t.api().get('/api/postman/environment.json');
    expect(res.status).toBe(200);
    expect(res.body.values.map((v: { key: string }) => v.key)).toEqual(['baseUrl', 'token', 'refreshToken', 'apiKey', 'rapidApiKey']);
    expect(res.body.values.find((v: { key: string }) => v.key === 'rapidApiKey').value).toBe('');
    expect(res.body.values[0].value).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});

describe('statik səhifələr', () => {
  const t = createTestApp();
  it('/docs → Swagger UI (bizim spec ilə), / → başlanğıc səhifəsi (web/dist yoxdur), naməlum API yolu yenə JSON 404', async () => {
    expect((await t.api().get('/docs')).status).toBe(301);
    const docs = await t.api().get('/docs/');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
    const init = await t.api().get('/docs/swagger-initializer.js');
    expect(init.text).toContain("url: '/api/openapi.json'");
    expect(init.text).toContain("clientId: 'apilab-portal'");
    expect((await t.api().get('/docs/swagger-ui-bundle.js')).status).toBe(200);

    const home = await t.api().get('/').set('Accept', 'text/html');
    expect(home.status).toBe(200);
    expect(home.text).toContain('web/dist');
    expect((await t.api().get('/bank/dashboard').set('Accept', 'text/html')).text).toContain('API Lab'); // SPA fallback

    const api404 = await t.api().get('/api/v1/nope').set('Accept', 'text/html');
    expect(api404.status).toBe(404);
    expect(api404.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
