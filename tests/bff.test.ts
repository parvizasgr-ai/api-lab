// BFF: aqreqasiya, meta.calls, 207 partial failure, bölmə timeout-u (504), auth/scope.
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

async function setup(config = {}) {
  const t = createTestApp({ config });
  const date = t.db.prepare(`SELECT date('now', '+3 days')`).pluck().get() as string;
  return { ...t, date, student: (await t.login('student')).access_token };
}

describe('/bff/dashboard', () => {
  it('1 sorğuda hesablar + kartlar + son 5 əməliyyat + USD/EUR məzənnəsi; meta.calls', async () => {
    const t = await setup();
    const res = await t.api().get('/bff/dashboard').set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'bffDashboard');
    expect(res.body.user).toEqual({ id: 1, username: 'student', fullName: 'Aysel Məmmədova' });
    expect(res.body.accounts).toHaveLength(3);
    expect(res.body.cards).toHaveLength(4);
    expect(res.body.recentTransactions).toHaveLength(5);
    expect(Object.keys(res.body.rates.rates)).toEqual(['USD', 'EUR']);
    expect(res.body.meta.calls.map((c: { name: string; status: number }) => [c.name, c.status])).toEqual([
      ['accounts.list', 200],
      ['cards.list', 200],
      ['transactions.recent', 200],
      ['currencies.rates', 200],
    ]);
    expect(res.body.meta.partial).toBe(false);
    // BFF HTTP-yə yenidən çıxmır: request_log-da yalnız 1 sorğu (login + dashboard)
    expect(t.db.prepare(`SELECT COUNT(*) FROM request_log WHERE path LIKE '/bff/%'`).pluck().get()).toBe(1);
  });

  it('tokensiz 401, scope çatışmır 403, bölmə xətası bütün cavabın xətasıdır', async () => {
    const t = await setup();
    expect((await t.api().get('/bff/dashboard')).status).toBe(401);
    const noScope = await t.auth.issueAccessToken({ id: 1, username: 'student', role: 'USER' }, ['accounts:read']);
    const res = await t.api().get('/bff/dashboard').set(bearer(noScope));
    expect(res.status).toBe(403);
    expect(res.body.details[0].message).toContain('cards:read');
    const failing = await t.api().get('/bff/dashboard').set(bearer(t.student)).set('X-Simulate', 'cards:503');
    expect(failing.status).toBe(503);
  });
});

describe('/bff/travel/search', () => {
  it('200: reys + otel paralel, hər bölmə {status, data}; city default — to hava limanının şəhəri', async () => {
    const t = await setup();
    const res = await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: t.date }).set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'bffTravelSearch');
    expect(res.body.flights.status).toBe(200);
    expect(res.body.flights.data.items.length).toBeGreaterThan(0);
    expect(res.body.hotels.data.items.every((h: { city: string }) => h.city === 'İstanbul')).toBe(true);
    expect(res.body.hotels.data.items[0]).toHaveProperty('pricePerNightFromAzn');
    expect(res.body.meta).toMatchObject({ partial: false });
    expect(res.body.meta.calls.map((c: { name: string }) => c.name)).toEqual(['flights.search', 'hotels.search']);
  });

  it('207 Multi-Status: X-Simulate: hotels:503 — otel bölməsi öz xətası və traceId-si ilə, reyslər yenə qaytarılır', async () => {
    const t = await setup();
    const res = await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: t.date }).set(bearer(t.student)).set('X-Simulate', 'hotels:503').set('X-Request-Id', 'travel-1');
    expect(res.status).toBe(207);
    expectMatchesSpec(res, 'bffTravelSearch');
    expect(res.body.flights.status).toBe(200);
    expect(res.body.flights.data.total).toBeGreaterThan(0);
    expect(res.body.hotels).toMatchObject({ status: 503, error: { status: 503, code: 'SERVICE_UNAVAILABLE', traceId: 'travel-1.hotels' } });
    expect(res.body.meta.partial).toBe(true);
    expect(res.body.meta.calls[1]).toMatchObject({ name: 'hotels.search', status: 503 });

    // Müqayisə: adi X-Simulate bütün sorğunu dayandırır
    const whole = await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: t.date }).set(bearer(t.student)).set('X-Simulate', '503');
    expect(whole.status).toBe(503);
  });

  it('bölmə timeout-u → həmin bölmə 504, cavab 207; digər bölmə təsirlənmir', async () => {
    const t = await setup({ bffCallTimeoutMs: 50 });
    const res = await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: t.date }).set(bearer(t.student)).set('X-Simulate', 'hotels:timeout');
    expect(res.status).toBe(207);
    expect(res.body.hotels).toMatchObject({ status: 504, error: { code: 'GATEWAY_TIMEOUT' } });
    expect(res.body.flights.status).toBe(200);
    expect(res.body.meta.calls[1].durationMs).toBeGreaterThanOrEqual(45);
  });

  it('error path-lər: date yoxdur 422, tokensiz 401, keçmiş tarix → otel bölməsi 422 (207), BFF xaricində bölmə simulyasiyası 422', async () => {
    const t = await setup();
    expect((await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST' }).set(bearer(t.student))).status).toBe(422);
    expect((await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: t.date })).status).toBe(401);
    const past = await t.api().get('/bff/travel/search').query({ from: 'GYD', to: 'IST', date: '2020-01-01' }).set(bearer(t.student));
    expect(past.status).toBe(207);
    expect(past.body.hotels).toMatchObject({ status: 422, error: { code: 'INVALID_DATE_RANGE' } });
    expect((await t.api().get('/api/v1/health').set('X-Simulate', 'hotels:503')).status).toBe(422);
  });
});

describe('/bff/music/home', () => {
  it('populyar treklər (playCount) + mənim playlist-lərim', async () => {
    const t = await setup();
    const res = await t.api().get('/bff/music/home').set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'bffMusicHome');
    expect(res.body.popular[0]).toMatchObject({ playCount: 5 });
    expect(res.body.playlists.map((p: { name: string }) => p.name)).toEqual(['Eurovision Azərbaycan', 'Dərs zamanı fon musiqisi']);
    expect(res.body.meta.calls).toHaveLength(2);
    expect((await t.api().get('/bff/music/home')).status).toBe(401);
  });
});
