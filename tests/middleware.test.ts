// Cross-cutting middleware: request-id, request_log, validation (400/415/422/406), 404/405,
// rate limit, X-Simulate, idempotency, vahid xəta formatı, BOLA helper.
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';
import { loadOwned } from '../server/src/lib/bola.js';
import { ApiError } from '../server/src/errors.js';

describe('X-Request-Id və request_log', () => {
  const t = createTestApp();

  it('hər cavabda X-Request-Id var, xətada traceId ilə eynidir', async () => {
    const ok = await t.api().get('/api/v1/health');
    expect(ok.headers['x-request-id']).toMatch(/^req_[a-f0-9]{12}$/);
    const err = await t.api().get('/api/v1/auth/me').set('X-Request-Id', 'my-trace-001');
    expect(err.headers['x-request-id']).toBe('my-trace-001');
    expect(err.body.traceId).toBe('my-trace-001');
  });

  it('sorğu request_log-a yazılır (route şablonu, status, user_id)', async () => {
    const { access_token } = await t.login();
    await t.api().get('/api/v1/auth/me').set(bearer(access_token)).set('X-Request-Id', 'log-check-1');
    const row = t.db.prepare(`SELECT * FROM request_log WHERE request_id = 'log-check-1'`).get() as Record<string, unknown>;
    expect(row).toMatchObject({ method: 'GET', path: '/api/v1/auth/me', route: '/api/v1/auth/me', status: 200, user_id: 1 });
  });

  it('CORS: brauzer üçün başlıqlar açıqdır', async () => {
    const res = await t.api().get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toContain('X-RateLimit-Remaining');
  });
});

describe('validation: 400 vs 422 vs 415', () => {
  const t = createTestApp();

  it('parse olunmayan JSON → 400 MALFORMED_JSON', async () => {
    const res = await t.api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"username": "student",');
    expect(res.status).toBe(400);
    expectMatchesSpec(res, 'authLogin');
    expect(res.body.code).toBe('MALFORMED_JSON');
  });

  it('düzgün JSON, amma bilinməyən sahə → 422 VALIDATION_ERROR', async () => {
    const res = await t.api().post('/api/v1/auth/login').send({ username: 'student', password: 'student123', remember: true });
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'authLogin');
    expect(res.body.details).toEqual([{ field: '/remember', message: 'must NOT have additional properties' }]);
  });

  it('məcburi sahə yoxdur, səhv tip → 422 (bütün xətalar birlikdə)', async () => {
    const res = await t.api().post('/api/v1/auth/login').send({ username: 12345 });
    expect(res.status).toBe(422);
    const fields = res.body.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['/password', '/username']));
  });

  it('body yoxdur → 422', async () => {
    const res = await t.api().post('/api/v1/auth/login');
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('body');
  });

  it('səhv Content-Type → 415', async () => {
    const res = await t.api().post('/api/v1/auth/login').set('Content-Type', 'text/plain').send('username=student');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('naməlum query parametri → 422', async () => {
    const res = await t.api().get('/api/v1/health').query({ verbose: 'true' });
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toEqual({ field: 'query verbose', message: 'naməlum query parametri' });
  });

  it('x-error-code: səhv reason → 422 INVALID_REASON', async () => {
    const { access_token } = await t.login();
    const res = await t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).send({ reason: 'BROKEN' });
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'blockCard');
    expect(res.body.code).toBe('INVALID_REASON');
    expect(res.body.details[0].message).toContain('LOST, STOLEN, SUSPECTED_FRAUD');
  });

  it('x-error-code: Idempotency-Key yoxdur → 422 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const { access_token } = await t.login();
    const res = await t
      .api()
      .post('/api/v1/transfers')
      .set(bearer(access_token))
      .send({ fromAccountId: 'AZ21NABZ0001', toAccountId: 'AZ21NABZ0004', amount: 10, currency: 'AZN' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('pul məbləği maksimum 2 onluq: 10.005 → 422, 10.01 → keçir', async () => {
    const { access_token } = await t.login();
    const send = (amount: number) =>
      t.api().post('/api/v1/transfers').set(bearer(access_token)).set('Idempotency-Key', 'key-precision-1')
        .send({ fromAccountId: 'AZ21NABZ0001', toAccountId: 'AZ21NABZ0004', amount, currency: 'AZN' });
    expect((await send(10.005)).status).toBe(422);
    expect((await send(10.01)).status).not.toBe(422);
  });
});

describe('404 / 405 / 406 / OPTIONS', () => {
  const t = createTestApp();

  it('naməlum endpoint → 404 ROUTE_NOT_FOUND', async () => {
    const res = await t.api().get('/api/v1/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('path var, metod yoxdur → 405 + Allow', async () => {
    const res = await t.api().delete('/api/v1/auth/login');
    expect(res.status).toBe(405);
    expect(res.body.code).toBe('METHOD_NOT_ALLOWED');
    expect(res.headers.allow).toBe('POST, OPTIONS');
  });

  it('dəstəklənməyən Accept → 406', async () => {
    const res = await t.api().get('/api/v1/health').set('Accept', 'text/csv');
    expect(res.status).toBe(406);
    expect(res.body.code).toBe('NOT_ACCEPTABLE');
  });

  it('OPTIONS → 204 + Allow', async () => {
    const res = await t.api().options('/api/v1/customers/1');
    expect(res.status).toBe(204);
    expect(res.headers.allow).toBe('GET, HEAD, PUT, PATCH, DELETE, OPTIONS');
  });
});

describe('rate limit (60/dəq)', () => {
  it('60 sorğu keçir, 61-ci → 429 + Retry-After; başqa subyekt təsirlənmir; yeni dəqiqədə sıfırlanır', async () => {
    const t = createTestApp();
    for (let i = 1; i <= 60; i++) {
      const res = await t.api().get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-remaining']).toBe(String(60 - i));
    }
    const blocked = await t.api().get('/api/v1/health');
    expect(blocked.status).toBe(429);
    expectMatchesSpec(blocked, 'health');
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers['retry-after']).toBe('60');
    expect(blocked.headers['x-ratelimit-limit']).toBe('60');
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');

    // Token sahibi ayrıca subyektdir (user:1), IP limitindən asılı deyil. Login-in özü də IP limitinə düşür,
    // ona görə token birbaşa yaradılır.
    const token = await t.auth.issueAccessToken({ id: 1, username: 'student', role: 'USER' }, []);
    expect((await t.api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(200);

    const counter = t.db.prepare(`SELECT count FROM rate_limit_counters WHERE subject LIKE 'ip:%'`).pluck().get();
    expect(counter).toBe(61);

    t.clock.advance(60);
    expect((await t.api().get('/api/v1/health')).status).toBe(200);
  });
});

describe('X-Simulate', () => {
  const t = createTestApp();

  it.each([
    ['500', 500, 'SIMULATED_ERROR'],
    ['503', 503, 'SERVICE_UNAVAILABLE'],
    ['timeout', 504, 'GATEWAY_TIMEOUT'],
    ['boom', 422, 'VALIDATION_ERROR'],
  ])('X-Simulate: %s → %i %s', async (mode, status, code) => {
    const res = await t.api().get('/api/v1/health').set('X-Simulate', mode);
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    if (mode === '503') expect(res.headers['retry-after']).toBe('5');
  });

  it('slow → gecikmə, sonra normal cavab', async () => {
    const res = await t.api().get('/api/v1/health').set('X-Simulate', 'slow');
    expect(res.status).toBe(200);
  });
});

describe('vahid xəta formatı', () => {
  it('gözlənilməz xəta → 500, stack trace və daxili mesaj qaytarılmır', async () => {
    const t = createTestApp({
      handlers: {
        health: () => {
          throw new Error('SQLITE_CORRUPT: secret internal detail');
        },
      },
    });
    const original = console.error;
    console.error = () => {};
    const res = await t.api().get('/api/v1/health');
    console.error = original;
    expect(res.status).toBe(500);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'details', 'message', 'status', 'timestamp', 'traceId']);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/secret|SQLITE|at .*\.ts/);
  });
});

describe('Idempotency-Key', () => {
  // Middleware-i modullardan asılı olmadan yoxlamaq üçün blockCard handler-i əvəz edirik: hər çağırış 1 audit sətri yazır.
  function setup() {
    const calls: number[] = [];
    const t = createTestApp({
      handlers: {
        blockCard: (req, res) => {
          calls.push(Number(req.params.cardId));
          res.json({ cardId: Number(req.params.cardId), previousStatus: 'ACTIVE', status: 'BLOCKED', reason: req.valid.body.reason, comment: null, changedAt: '2026-10-13T09:00:00Z', message: `call #${calls.length}` });
        },
      },
    });
    return { ...t, calls };
  }

  it('eyni açar + eyni body → saxlanmış cavab (handler 1 dəfə)', async () => {
    const t = setup();
    const { access_token } = await t.login();
    const send = () => t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).set('Idempotency-Key', 'block-card-1-abc').send({ reason: 'LOST' });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(t.calls).toHaveLength(1);
    const rows = t.db.prepare(`SELECT key, user_id, endpoint, response_status, expires_at, created_at FROM idempotency_keys`).all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'block-card-1-abc', user_id: 1, endpoint: 'POST /api/v1/cards/1/block', response_status: 200 });
    expect(new Date(rows[0].expires_at).getTime() - new Date(rows[0].created_at).getTime()).toBe(24 * 3600 * 1000);
  });

  it('eyni açar + fərqli body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const t = setup();
    const { access_token } = await t.login();
    await t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).set('Idempotency-Key', 'block-card-1-xyz').send({ reason: 'LOST' });
    const res = await t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).set('Idempotency-Key', 'block-card-1-xyz').send({ reason: 'STOLEN' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(t.calls).toHaveLength(1);
  });

  it('açarsız sorğular hər dəfə icra olunur; 24 saatdan sonra açar yenidən istifadə oluna bilər', async () => {
    const t = setup();
    const { access_token } = await t.login();
    await t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).send({ reason: 'LOST' });
    await t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).send({ reason: 'LOST' });
    expect(t.calls).toHaveLength(2);

    const withKey = () => t.api().post('/api/v1/cards/1/block').set(bearer(access_token)).set('Idempotency-Key', 'expiring-key-01').send({ reason: 'LOST' });
    await withKey();
    t.clock.advance(24 * 3600 + 1);
    const { access_token: fresh } = await t.login();
    const res = await t.api().post('/api/v1/cards/1/block').set(bearer(fresh)).set('Idempotency-Key', 'expiring-key-01').send({ reason: 'LOST' });
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(t.calls).toHaveLength(4);
  });
});

describe('BOLA helper', () => {
  const auth = { userId: 1, username: 'student', role: 'USER' as const, scopes: [], via: 'bearer' as const };
  it('yoxdur → 404, başqasınındır → 403, özününküdür → resurs', () => {
    expect(() => loadOwned(undefined, auth, 'CARD_NOT_FOUND', 'Kart tapılmadı')).toThrow(ApiError);
    try {
      loadOwned({ owner_id: 3 }, auth, 'CARD_NOT_FOUND', 'x');
    } catch (e) {
      expect((e as ApiError).status).toBe(403);
    }
    expect(loadOwned({ owner_id: 1, id: 7 }, auth, 'CARD_NOT_FOUND', 'x')).toEqual({ owner_id: 1, id: 7 });
  });
});
