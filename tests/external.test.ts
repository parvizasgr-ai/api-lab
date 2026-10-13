// W4 — External APIs (RapidAPI) proxy: upstream mock ilə (real RapidAPI-yə sorğu YOXDUR).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXTERNAL_CATALOG } from '../server/src/modules/external/catalog.js';
import { buildUpstreamUrl, maskKey } from '../server/src/modules/external/proxy.js';
import { createTestApp, bearer, expectMatchesSpec } from './helpers.js';
import { externalConfig, mockUpstream, PNG, SERVER_KEY, STUDENT_KEY, verifiedCatalog } from './fixtures/external.js';

const setup = (reply?: Parameters<typeof mockUpstream>[0], overrides: Parameters<typeof externalConfig>[1] = {}) => {
  const upstream = mockUpstream(reply);
  const ctx = createTestApp({ config: externalConfig(upstream.fetchFn, overrides) });
  return { ...ctx, upstream };
};
const withKey = (key = STUDENT_KEY) => ({ 'X-RapidAPI-Key': key });

afterEach(() => vi.restoreAllMocks());

describe('kataloq', () => {
  it('yalnız 7 təsdiqlənmiş API (Currency, News, IP, Quotes yoxdur), hamısı *.p.rapidapi.com, operationId-lər spec-dədir', async () => {
    expect(EXTERNAL_CATALOG.map((a) => a.id)).toEqual(['jokes', 'geodb', 'weather', 'movies', 'numbers', 'translate', 'qr']);
    for (const api of EXTERNAL_CATALOG) expect(api.host).toMatch(/^[a-z0-9-]+\.p\.rapidapi\.com$/);
    const { spec } = await import('./helpers.js');
    const ops = new Set(Object.values(spec.paths).flatMap((item: any) => Object.values(item).map((o: any) => o.operationId)));
    for (const e of EXTERNAL_CATALOG.flatMap((a) => a.endpoints)) expect(ops, e.operationId).toContain(e.operationId);
  });

  it('verified:false API tələbəyə göstərilmir və proxy 404 qaytarır; ADMIN görür (unverified siyahısı)', async () => {
    const catalog = verifiedCatalog().map((a) => (a.id === 'weather' ? { ...a, verified: false } : a));
    const { api, login, upstream } = setup(undefined, { catalog });
    const student = await api().get('/external/catalog').set(bearer((await login()).access_token));
    expect(student.status).toBe(200);
    expectMatchesSpec(student, 'externalCatalog');
    expect(student.body.items.map((a: { id: string }) => a.id)).not.toContain('weather');
    expect(student.body.unverified).toBeUndefined();
    const anon = await api().get('/external/catalog');
    expect(anon.body.items).toHaveLength(6);
    const admin = await api().get('/external/catalog').set(bearer((await login('admin')).access_token));
    expect(admin.body.items.map((a: { id: string }) => a.id)).toContain('weather');
    expect(admin.body.unverified).toEqual(['weather']);
    const proxied = await api().get('/external/weather/current.json?q=Baku').set(withKey());
    expect(proxied.status).toBe(404);
    expect(proxied.body.code).toBe('EXTERNAL_API_NOT_FOUND');
    expect(upstream.calls).toHaveLength(0);
  });

  it('default kataloqda hər şey verified:false-dur → tələbə boş siyahı görür (external:verify ilə təsdiqlənənə qədər)', async () => {
    const { api } = createTestApp();
    const res = await api().get('/external/catalog');
    expect(res.body.items).toEqual([]);
    expect((await api().get('/external/jokes/joke/Programming').set(withKey())).status).toBe(404);
  });

  it('kataloq cavabında açar yoxdur (server key açıq olsa belə)', async () => {
    const { api, login } = setup(undefined, { serverKey: SERVER_KEY, serverKeyEnabled: true });
    const res = await api().get('/external/catalog').set(bearer((await login('admin')).access_token));
    expect(JSON.stringify(res.body)).not.toContain(SERVER_KEY);
    expect(res.body.items.find((a: { id: string }) => a.id === 'geodb').serverKeyAvailable).toBe(true); // hard limit
    expect(res.body.items.find((a: { id: string }) => a.id === 'jokes').serverKeyAvailable).toBe(false);
  });
});

describe('proxy — normal axın', () => {
  it('GET: tələbə açarı ötürülür, URL kataloqdan, yalnız icazəli query; cavab dəyişdirilmir; X-Cache/X-External-*', async () => {
    const { api, upstream } = setup({ body: { data: [{ city: 'Baku' }] } });
    const res = await api().get('/external/geodb/v1/geo/cities?namePrefix=Bak&limit=5').set(withKey());
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'externalGeoCities');
    expect(res.body).toEqual({ data: [{ city: 'Baku' }] });
    expect(res.headers).toMatchObject({ 'x-cache': 'MISS', 'x-external-api': 'geodb', 'x-external-key-source': 'student', 'x-upstream-ratelimit-remaining': '999' });
    expect(upstream.calls).toHaveLength(1);
    const call = upstream.calls[0];
    expect(call.url.toString()).toBe('https://wft-geo-db.p.rapidapi.com/v1/geo/cities?namePrefix=Bak&limit=5');
    expect(call.headers['x-rapidapi-key']).toBe(STUDENT_KEY);
    expect(call.headers['x-rapidapi-host']).toBe('wft-geo-db.p.rapidapi.com');
    expect(call.redirect).toBe('error'); // redirect ilə başqa host-a getmək olmur
  });

  it('POST translate: yalnız JSON body ötürülür', async () => {
    const { api, upstream } = setup({ body: { data: { translations: { translatedText: 'Hello' } } } });
    const res = await api().post('/external/translate/language/translate/v2').set(withKey()).send({ q: 'Salam', source: 'az', target: 'en' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'externalTranslate');
    expect(upstream.calls[0].method).toBe('POST');
    expect(JSON.parse(upstream.calls[0].body!)).toEqual({ q: 'Salam', source: 'az', target: 'en' });
    expect((await api().post('/external/translate/language/translate/v2').set(withKey()).send({ q: 'x', source: 'az', target: 'en', url: 'http://evil' })).status).toBe(422);
  });

  it('şəkil cavabı (QR) image/png olaraq ötürülür', async () => {
    const { api } = setup();
    const res = await api().get('/external/qr/generate?d=https%3A%2F%2Fapilab.az&size=300').set(withKey()).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  it('upstream HTML/SVG cavabı brauzerdə icra olunmasın: application/octet-stream + nosniff', async () => {
    const { api } = setup(() => new Response('<svg onload=alert(1)>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }));
    const res = await api().get('/external/jokes/joke/Any').set(withKey());
    expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('qısa GET cache: eyni açar + sorğu → HIT (upstream 1 dəfə); başqa açar → ayrıca MISS; POST cache olunmur', async () => {
    const { api, upstream } = setup();
    const a = await api().get('/external/numbers/42/trivia?json=true').set(withKey());
    const b = await api().get('/external/numbers/42/trivia?json=true').set(withKey());
    expect([a.headers['x-cache'], b.headers['x-cache']]).toEqual(['MISS', 'HIT']);
    expect(upstream.calls).toHaveLength(1);
    const other = await api().get('/external/numbers/42/trivia?json=true').set(withKey('another-student-key-000000000000'));
    expect(other.headers['x-cache']).toBe('MISS');
    for (let i = 0; i < 2; i++) await api().post('/external/translate/language/translate/v2').set(withKey()).send({ q: 'a', source: 'az', target: 'en' });
    expect(upstream.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('Idempotency-Key (daxil olmuş istifadəçi): təkrar POST upstream-ə getmir', async () => {
    const { api, login, upstream } = setup();
    const token = (await login()).access_token;
    const post = () => api().post('/external/translate/language/translate/v2').set(withKey()).set(bearer(token)).set('Idempotency-Key', 'ext-translate-0001').send({ q: 'Salam', source: 'az', target: 'en' });
    const first = await post();
    const second = await post();
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(upstream.calls).toHaveLength(1);
  });
});

describe('açarlar', () => {
  it('açar yoxdur → 503 EXTERNAL_KEY_MISSING (vahid format), upstream çağırılmır', async () => {
    const { api, upstream } = setup();
    const res = await api().get('/external/jokes/joke/Any');
    expect(res.status).toBe(503);
    expectMatchesSpec(res, 'externalJoke');
    expect(res.body.code).toBe('EXTERNAL_KEY_MISSING');
    expect(upstream.calls).toHaveLength(0);
  });

  it('server key standart olaraq SÖNDÜRÜLÜB: RAPIDAPI_KEY olsa belə istifadə olunmur', async () => {
    const { api, login, upstream } = setup(undefined, { serverKey: SERVER_KEY, serverKeyEnabled: false });
    const res = await api().get('/external/geodb/v1/geo/countries/AZ').set(bearer((await login()).access_token));
    expect(res.status).toBe(503);
    expect(upstream.calls).toHaveLength(0);
  });

  it('server key açıqdırsa: yalnız Hard Limit API + daxil olmuş istifadəçi; tələbə açarı həmişə üstündür', async () => {
    const { api, login, upstream } = setup(undefined, { serverKey: SERVER_KEY, serverKeyEnabled: true });
    const token = (await login()).access_token;
    const geo = await api().get('/external/geodb/v1/geo/countries/AZ').set(bearer(token));
    expect(geo.status).toBe(200);
    expect(geo.headers['x-external-key-source']).toBe('server');
    expect(upstream.calls[0].headers['x-rapidapi-key']).toBe(SERVER_KEY);
    expect((await api().get('/external/jokes/joke/Any').set(bearer(token))).status).toBe(503); // hard limit deyil
    expect((await api().get('/external/geodb/v1/geo/countries/TR')).status).toBe(503); // anonim
    const own = await api().get('/external/geodb/v1/geo/countries/GE').set(bearer(token)).set(withKey());
    expect(own.headers['x-external-key-source']).toBe('student');
    expect(upstream.calls.at(-1)!.headers['x-rapidapi-key']).toBe(STUDENT_KEY);
  });

  it('açar heç yerdə qalmır: cavab (başlıq + body), DB-nin bütün cədvəlləri, /_history, console logları', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => void logs.push(args.join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...args) => void logs.push(args.join(' ')));
    // Upstream açarı cavabda əks etdirir (pis upstream) + bir sorğu 500 ilə bitir (log yazılır)
    let n = 0;
    const { api, login, db } = setup((call) =>
      ++n === 2
        ? new Response(`boom ${call.headers['x-rapidapi-key']}`, { status: 500 })
        : new Response(JSON.stringify({ echo: call.headers['x-rapidapi-key'] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const token = (await login()).access_token;
    const ok = await api().get('/external/jokes/joke/Any').set(withKey()).set(bearer(token));
    const fail = await api().get('/external/jokes/joke/Misc').set(withKey()).set(bearer(token));
    expect(fail.status).toBe(502);
    for (const res of [ok, fail]) {
      expect(JSON.stringify(res.headers)).not.toContain(STUDENT_KEY);
      expect(res.text).not.toContain(STUDENT_KEY);
    }
    expect(ok.body).toEqual({ echo: '***' });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const table of tables) expect(JSON.stringify(db.prepare(`SELECT * FROM "${table}"`).all()), table).not.toContain(STUDENT_KEY);
    const history = await api().get('/api/v1/_history').set(bearer(token));
    expect(history.body.items.some((i: { path: string }) => i.path.startsWith('/external/'))).toBe(true);
    expect(JSON.stringify(history.body)).not.toContain(STUDENT_KEY);
    expect(logs.join('\n')).not.toContain(STUDENT_KEY);
    expect(logs.join('\n')).toContain(maskKey(STUDENT_KEY));
  });

  it('maskKey açarın yalnız 4+2 simvolunu göstərir', () => {
    expect(maskKey(STUDENT_KEY)).toBe(`stud…ef (${STUDENT_KEY.length})`);
    expect(maskKey('short')).toBe('***');
  });
});

describe('upstream xətaları → 502/504 (vahid format)', () => {
  const cases: [string, Parameters<typeof mockUpstream>[0], number, string, string?][] = [
    ['403 not subscribed', { status: 403, body: { message: 'You are not subscribed to this API.' } }, 502, 'EXTERNAL_NOT_SUBSCRIBED'],
    ['401 invalid key', { status: 401, body: { message: 'Invalid API key. Go to https://docs.rapidapi.com/docs/keys' } }, 502, 'EXTERNAL_KEY_INVALID'],
    ['429 limit', { status: 429, body: { message: 'You have exceeded the DAILY quota' }, headers: { 'retry-after': '120' } }, 502, 'EXTERNAL_RATE_LIMITED', '120'],
    ['429 Retry-After-siz', { status: 429, body: {} }, 502, 'EXTERNAL_RATE_LIMITED', '60'],
    ['503 upstream', { status: 503, body: 'down' }, 502, 'EXTERNAL_UPSTREAM_ERROR'],
    ['şəbəkə xətası', new TypeError('fetch failed'), 502, 'EXTERNAL_UNAVAILABLE'],
  ];
  for (const [label, reply, status, code, retryAfter] of cases) {
    it(label, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { api } = setup(reply);
      const res = await api().get('/external/jokes/joke/Any').set(withKey());
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expectMatchesSpec(res, 'externalJoke');
      if (retryAfter) expect(res.headers['retry-after']).toBe(retryAfter);
    });
  }

  it('timeout → 504 EXTERNAL_TIMEOUT + Retry-After', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    const { api } = setup(err, { timeoutMs: 50 });
    const res = await api().get('/external/jokes/joke/Any').set(withKey());
    expect(res.status).toBe(504);
    expect(res.body.code).toBe('EXTERNAL_TIMEOUT');
    expect(res.headers['retry-after']).toBeDefined();
    expectMatchesSpec(res, 'externalJoke');
  });

  it('real timeout: AbortSignal upstream-i kəsir', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const slow = (async (_url: string | URL, init: RequestInit = {}) =>
      new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch;
    const { api } = createTestApp({ config: externalConfig(slow, { timeoutMs: 30 }) });
    const res = await api().get('/external/jokes/joke/Any').set(withKey());
    expect(res.status).toBe(504);
  });

  it('cavab ölçüsü limiti → 502 EXTERNAL_RESPONSE_TOO_LARGE (content-length olmadan da)', async () => {
    const big = 'x'.repeat(2048);
    const stream = () =>
      new Response(new ReadableStream({ start(c) { for (let i = 0; i < 4; i++) c.enqueue(new TextEncoder().encode(big)); c.close(); } }), { headers: { 'content-type': 'application/json' } });
    const { api } = setup(stream, { maxResponseBytes: 4096 });
    const res = await api().get('/external/jokes/joke/Any').set(withKey());
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('EXTERNAL_RESPONSE_TOO_LARGE');
  });

  it('ümumi rate limit (60/dəq) external yollara da tətbiq olunur', async () => {
    const { api } = setup(undefined, {});
    const ctx = createTestApp({ config: { ...externalConfig(mockUpstream().fetchFn), rateLimit: { limit: 2, windowSec: 60 } } });
    void api;
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await ctx.api().get(`/external/numbers/${i}/trivia`).set(withKey())).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('SSRF qoruması', () => {
  const attempts = [
    '/external/jokes/joke/..%2f..%2fadmin',
    '/external/jokes/joke/%2e%2e/admin',
    '/external/jokes/joke/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
    '/external/geodb/v1/geo/countries/..',
    '/external/geodb//v1/geo/cities',
    '/external/jokes/joke/Any@evil.example',
    '/external/jokes/joke/%40evil.example',
    '/external/jokes/joke/Any%5c..%5cadmin',
    '/external/jokes/joke/Any%0d%0aHost:%20evil.example',
    '/external/jokes/joke/Any%00',
    '/external/numbers/42/trivia?json=true%0d%0aX-Injected:1',
    '/external/http://evil.example/x',
    '/external/https:%2f%2fevil.example',
    '/external/evil.p.rapidapi.com/joke/Any',
    '/external/jokes/../../api/v1/_reset',
    '/external/numbers/1;rm -rf/trivia',
    '/external/numbers/169.254.169.254/trivia',
    '/external/geodb/v1/geo/countries/az',
    '/external/qr/generate?d=x&url=http://169.254.169.254',
  ];
  for (const url of attempts) {
    it(`rədd olunur və upstream çağırılmır: ${url}`, async () => {
      const { api, upstream } = setup();
      const res = await api().get(url).set(withKey());
      expect([400, 404, 405, 422], `${res.status} ${JSON.stringify(res.body)}`).toContain(res.status);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(upstream.calls).toHaveLength(0);
    });
  }

  it('xam yolda .. → 400 EXTERNAL_PATH_REJECTED (vahid format)', async () => {
    const { api } = setup();
    const res = await api().get('/external/jokes/joke/..%2f..%2fadmin').set(withKey());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXTERNAL_PATH_REJECTED');
    expect(Object.keys(res.body).sort()).toEqual(['code', 'details', 'message', 'status', 'timestamp', 'traceId']);
  });

  it('müştəri başlıqları upstream-ə getmir: Authorization, Cookie, X-Forwarded-For, Host override, X-RapidAPI-Host', async () => {
    const { api, login, upstream } = setup();
    const token = (await login()).access_token;
    await api()
      .get('/external/jokes/joke/Any')
      .set(withKey())
      .set(bearer(token))
      .set('Cookie', 'session=secret')
      .set('X-Forwarded-For', '169.254.169.254')
      .set('X-RapidAPI-Host', 'evil.example')
      .set('X-Custom', 'leak');
    const sent = upstream.calls[0];
    expect(Object.keys(sent.headers).sort()).toEqual(['accept', 'user-agent', 'x-rapidapi-host', 'x-rapidapi-key']);
    expect(sent.headers['x-rapidapi-host']).toBe('jokeapi-v2.p.rapidapi.com');
    expect(sent.url.host).toBe('jokeapi-v2.p.rapidapi.com');
  });

  it('buildUpstreamUrl: pattern-ə uyğun olmayan parametr, host dəyişdirmə cəhdi və kataloqdan kənar query rədd/atılır', () => {
    const geo = EXTERNAL_CATALOG.find((a) => a.id === 'geodb')!;
    const country = geo.endpoints.find((e) => e.operationId === 'externalGeoCountry')!;
    expect(() => buildUpstreamUrl(geo, country, { countryId: '../x' }, {})).toThrow(/icazəli/);
    expect(() => buildUpstreamUrl(geo, country, { countryId: 'AZ@evil' }, {})).toThrow();
    const ok = buildUpstreamUrl(geo, country, { countryId: 'AZ' }, { evil: 'http://x' });
    expect(ok.toString()).toBe('https://wft-geo-db.p.rapidapi.com/v1/geo/countries/AZ');
    const tampered = { ...geo, host: 'evil.example/@x' };
    expect(() => buildUpstreamUrl(tampered, country, { countryId: 'AZ' }, {})).toThrow(/kataloqdan kənar/);
  });

  it('upstream redirect izlənmir (redirect: error → 502)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api } = setup(new TypeError('unexpected redirect'));
    const res = await api().get('/external/jokes/joke/Any').set(withKey());
    expect(res.status).toBe(502);
  });
});

describe('external:verify (təklif, avtomatik dəyişiklik yoxdur)', () => {
  it('hər API-yə 1 sorğu kataloq nümunəsi ilə; nəticə → verified təklifi; catalog.ts dəyişmir', async () => {
    const { verifyCatalog } = await import('../server/src/modules/external/verify.js');
    const byHost: Record<string, () => Response> = {
      'jokeapi-v2.p.rapidapi.com': () => new Response('{"joke":"x"}', { status: 200 }),
      'wft-geo-db.p.rapidapi.com': () => new Response('{"message":"You are not subscribed to this API."}', { status: 403 }),
      'weatherapi-com.p.rapidapi.com': () => new Response('{"message":"Invalid API key"}', { status: 401 }),
      'movie-database-alternative.p.rapidapi.com': () => new Response('{}', { status: 429 }),
      'numbersapi.p.rapidapi.com': () => new Response('{}', { status: 404 }),
      'deep-translate1.p.rapidapi.com': () => new Response('{}', { status: 503 }),
    };
    const seen: string[] = [];
    const fetchFn = (async (url: string | URL, init: RequestInit = {}) => {
      const u = new URL(String(url));
      seen.push(`${init.method} ${u}`);
      expect((init.headers as Record<string, string>)['X-RapidAPI-Key']).toBe(STUDENT_KEY);
      const handler = byHost[u.host];
      if (!handler) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      return handler();
    }) as typeof fetch;
    const before = JSON.stringify(EXTERNAL_CATALOG.map((a) => a.verified));
    const rows = await verifyCatalog(EXTERNAL_CATALOG, STUDENT_KEY, fetchFn);
    expect(rows.map((r) => [r.id, r.verdict, r.proposed])).toEqual([
      ['jokes', 'OK', true],
      ['geodb', 'NOT_SUBSCRIBED', false],
      ['weather', 'KEY_INVALID', false],
      ['movies', 'RATE_LIMITED', false], // qərar yoxdur → cari dəyər qalır
      ['numbers', 'ENDPOINT_NOT_FOUND', false],
      ['translate', 'UPSTREAM_ERROR', false],
      ['qr', 'HOST_NOT_FOUND', false],
    ]);
    expect(seen).toHaveLength(7);
    expect(seen[0]).toBe('GET https://jokeapi-v2.p.rapidapi.com/joke/Programming?type=single');
    expect(seen[5]).toBe('POST https://deep-translate1.p.rapidapi.com/language/translate/v2');
    expect(JSON.stringify(EXTERNAL_CATALOG.map((a) => a.verified))).toBe(before);
  });
});
