// Avtomatik contract test — openapi.json-dakı HƏR əməliyyat üçün (əl ilə siyahı yoxdur):
//   1. happy path: spec-dəki nümunələrlə (param/body example) sorğu → 2xx, status kodu sənədləşdirilib, cavab sxemə uyğundur
//   2. auth: təhlükəsizlik tələb olunan endpoint token-siz → 401 (vahid xəta formatı)
//   3. rol: `admin` scope-lu endpoint student token-i ilə → 403
//   4. strict validation: JSON body-yə naməlum sahə → 422; naməlum query parametri → 422
//   5. hər xəta cavabı {timestamp,status,code,message,details[],traceId}, code ErrorCode enum-undadır, traceId = X-Request-Id
//   6. cavabın Content-Type-ı spec-də həmin status üçün sənədləşdirilib
// Yeni endpoint spec-ə əlavə olunanda bu test onu avtomatik əhatə edir.
import { describe, expect, it } from 'vitest';
import type request from 'supertest';
import { listOperations, resolveRef, type OperationInfo } from '../server/src/openapi/spec.js';
import { config as baseConfig } from '../server/src/config.js';
import { detectTools } from '../server/src/modules/materials/tools.js';
import { makePdf } from './fixtures/files.js';
import { externalConfig, mockUpstream, STUDENT_KEY } from './fixtures/external.js';
import { createTestApp, expectMatchesSpec, spec } from './helpers.js';

const tools = detectTools(baseConfig);

const API_KEY = 'apilab-demo-key-2026';
const ERROR_CODES = new Set<string>(spec.components.schemas.ErrorCode.enum);
const operations = listOperations(spec);

type Auth = 'none' | 'bearer' | 'apiKey' | 'basic';
const schemesOf = (op: OperationInfo): string[][] => (op.operation.security ?? []).map((s: object) => Object.keys(s));
const optionalAuth = (op: OperationInfo) => schemesOf(op).some((s) => s.length === 0);
function authOf(op: OperationInfo): Auth {
  const flat = schemesOf(op).flat();
  if (flat.includes('bearerAuth') || flat.includes('googleOAuth')) return 'bearer';
  if (flat.includes('apiKeyAuth')) return 'apiKey';
  if (flat.includes('basicAuth')) return 'basic';
  return 'none';
}
const needsSuperadmin = (op: OperationInfo) => (op.operation['x-required-scopes'] ?? []).includes('superadmin');
const needsAdmin = (op: OperationInfo) => needsSuperadmin(op) || (op.operation['x-required-scopes'] ?? []).includes('admin');

function exampleOf(node: any): unknown {
  if (!node) return undefined;
  if (node.example !== undefined) return node.example;
  if (node.examples) {
    const first: any = Object.values(node.examples)[0];
    return resolveRef(spec, first)?.value;
  }
  if (node.schema) return exampleOf(resolveRef(spec, node.schema));
  return node.default ?? node.enum?.[0];
}

function paramsOf(op: OperationInfo) {
  return [...(spec.paths[op.path].parameters ?? []), ...(op.operation.parameters ?? [])].map((p: any) => resolveRef(spec, p));
}

function buildRequest(op: OperationInfo, pathOverrides: Record<string, string | number> = {}) {
  let url = op.path;
  const query: Record<string, string> = {};
  const headers: Record<string, string> = {};
  for (const p of paramsOf(op)) {
    const value = p.in === 'path' && p.name in pathOverrides ? pathOverrides[p.name] : exampleOf(p);
    if (p.in === 'path') url = url.replace(`{${p.name}}`, encodeURIComponent(String(value)));
    else if (p.required && value !== undefined) {
      if (p.in === 'query') query[p.name] = String(value);
      if (p.in === 'header') headers[p.name] = String(value);
    }
  }
  const rb = resolveRef(spec, op.operation.requestBody);
  const media = rb ? (Object.entries<any>(rb.content)[0] ?? []) : [];
  return { url, query, headers, contentType: media[0] as string | undefined, body: media[1] ? exampleOf(media[1]) : undefined };
}

// Fayl yükləmə (multipart) happy path-ları materials.test.ts-də real fayllarla yoxlanır.
const skipHappy = (op: OperationInfo) => buildRequest(op).contentType === 'multipart/form-data';

type Ctx = ReturnType<typeof createTestApp>;

type Overrides = { body?: unknown; query?: Record<string, string>; path?: Record<string, string | number>; headers?: Record<string, string> };

// External proxy əməliyyatları: upstream mock + verified kataloq + tələbə açarı (real RapidAPI-yə getmirik)
const isExternalProxy = (op: OperationInfo) => op.path.startsWith('/external/') && op.operationId !== 'externalCatalog';
const appFor = (op: OperationInfo) => (isExternalProxy(op) ? createTestApp({ config: externalConfig(mockUpstream().fetchFn) }) : createTestApp());
const externalHeaders = (op: OperationInfo) => (isExternalProxy(op) ? { 'X-RapidAPI-Key': STUDENT_KEY } : {});

async function send(ctx: Ctx, op: OperationInfo, auth: Auth | 'student-bearer', overrides: Overrides = {}) {
  const r = buildRequest(op, overrides.path);
  let req = (ctx.api() as any)[op.method](r.url).query({ ...r.query, ...overrides.query }) as request.Test;
  for (const [k, v] of Object.entries({ ...r.headers, ...externalHeaders(op), ...overrides.headers })) req = req.set(k, v);
  if (auth === 'bearer' || auth === 'student-bearer') {
    const user = auth === 'bearer' && needsSuperadmin(op) ? 'muellim1' : auth === 'bearer' && needsAdmin(op) ? 'admin' : 'student';
    req = req.set('Authorization', `Bearer ${(await ctx.login(user)).access_token}`);
  }
  if (auth === 'apiKey') req = req.set('X-API-Key', API_KEY);
  if (auth === 'basic') req = req.auth('student', 'student123');
  const body = 'body' in overrides ? overrides.body : r.body;
  if (body !== undefined && r.contentType && r.contentType !== 'multipart/form-data') {
    req = req.set('Content-Type', r.contentType);
    req = r.contentType.includes('urlencoded') ? req.send(new URLSearchParams(body as Record<string, string>).toString()) : req.send(body as object);
  }
  return req;
}

// Vəziyyətdən asılı əməliyyatlar: spec nümunəsi təzə DB-də "uğurlu" ola bilmir (məs. bloklu olmayan kartı açmaq).
// Burada yalnız ön şərt yaradılır — sorğunun özü yenə spec-dən qurulur.
const PREPARE: Record<string, (ctx: Ctx) => Promise<Overrides>> = {
  async authRefresh(ctx) {
    return { body: { refresh_token: (await ctx.login()).refresh_token } };
  },
  async oauthToken(ctx) {
    const decision = await ctx.api().post('/oauth/authorize').set('Accept', 'application/json').type('form').send({
      client_id: 'apilab-portal', redirect_uri: 'http://localhost:5173/oauth/callback', scope: 'openid profile email', state: 'xyz-12345678',
      username: 'student', password: 'student123', decision: 'allow',
    });
    const code = new URL(decision.body.location).searchParams.get('code')!;
    return { body: { grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:5173/oauth/callback', client_id: 'apilab-portal', client_secret: 'apilab-portal-secret' } };
  },
  async unblockCard(ctx) {
    const token = (await ctx.login()).access_token;
    await ctx.api().post('/api/v1/cards/1/block').set('Authorization', `Bearer ${token}`).send({ reason: 'LOST' });
    return {};
  },
  ...Object.fromEntries(['getHotelBooking', 'cancelHotelBooking', 'updateHotelBooking'].map((id) => [id, async () => ({ path: { bookingId: 2 } })])),
  async createBookReview() {
    return { path: { bookId: 1 } };
  },
  async createHotelReview() {
    return { path: { hotelId: 3 } }; // student-in bu otelə seed rəyi yoxdur
  },
  // Bildiriş Kafka consumer-i ilə yaranır: kartı blokla → notification-service → MongoDB
  async updateNotification(ctx) {
    const token = (await ctx.login()).access_token;
    await ctx.api().post('/api/v1/cards/1/block').set('Authorization', `Bearer ${token}`).send({ reason: 'LOST' });
    await (ctx.app.locals.infra as { kafka: { idle(): Promise<void> } }).kafka.idle();
    const list = await ctx.api().get('/api/v1/notifications').set('Authorization', `Bearer ${token}`);
    return { path: { notificationId: list.body.items[0]._id } };
  },
  ...Object.fromEntries(
    ['getMaterial', 'deleteMaterial', 'updateMaterial', 'reconvertMaterial', 'listMaterialPages', 'getMaterialPageImage', 'getMaterialPageThumb', 'downloadMaterial', 'getMaterialPdf'].map((id) => [
      id,
      async (ctx: Ctx) => {
        const admin = (await ctx.login('admin')).access_token;
        const res = await ctx.api().post('/api/v1/materials').set('Authorization', `Bearer ${admin}`).field('title', 'Contract').field('lesson', '1').attach('file', makePdf(1), { filename: 'contract.pdf', contentType: 'application/pdf' });
        await (ctx.app.locals.materials as { queue: { idle(): Promise<void> } }).queue.idle();
        return { path: { materialId: res.body.id } };
      },
    ]),
  ),
};
const needsPdftoppm = (op: OperationInfo) => /MaterialPage(Image|Thumb)|listMaterialPages|getMaterialPdf/.test(op.operationId);

const oauthFormat = (op: OperationInfo) => op.operation['x-error-format'] === 'oauth2';

function expectContract(res: request.Response, op: OperationInfo) {
  const documented = op.operation.responses?.[String(res.status)];
  expect(documented, `${op.operationId}: ${res.status} sənədləşdirilməyib — ${JSON.stringify(res.body)}`).toBeDefined();
  const response = resolveRef(spec, documented);
  const contentType = String(res.headers['content-type'] ?? '').split(';')[0];
  if (response.content && res.status !== 304 && op.method !== 'head') {
    expect(Object.keys(response.content), `${op.operationId} ${res.status}: Content-Type ${contentType} sənədləşdirilməyib`).toContain(contentType);
  }
  if (res.status >= 400 && !(oauthFormat(op) && res.status === 400)) expectErrorFormat(res);
  if (contentType.includes('json')) expectMatchesSpec(res, op.operationId); // binary/HTML cavablarda yalnız Content-Type yoxlanır
}

export function expectErrorFormat(res: request.Response) {
  const b = res.body;
  expect(Object.keys(b).sort(), JSON.stringify(b)).toEqual(['code', 'details', 'message', 'status', 'timestamp', 'traceId']);
  expect(b.status).toBe(res.status);
  expect(ERROR_CODES, `naməlum xəta kodu ${b.code}`).toContain(b.code);
  expect(Array.isArray(b.details)).toBe(true);
  expect(Number.isNaN(Date.parse(b.timestamp))).toBe(false);
  expect(b.traceId).toBe(res.headers['x-request-id']);
}

describe('contract: bütün əməliyyatlar spec-də nümunələrlə', () => {
  it('spec-də əməliyyatlar var', () => expect(operations.length).toBeGreaterThan(80));

  for (const op of operations) {
    const name = `${op.method.toUpperCase()} ${op.path} (${op.operationId})`;
    const auth = authOf(op);

    it.skipIf(skipHappy(op) || (needsPdftoppm(op) && !tools.pdftoppm))(`happy path: ${name}`, async () => {
      const ctx = appFor(op);
      const res = await send(ctx, op, auth, await PREPARE[op.operationId]?.(ctx));
      expect(res.status, `${name} → ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(200);
      expect(res.status, `${name} → ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(400);
      expectContract(res, op);
    });

    if (auth !== 'none' && !optionalAuth(op)) {
      it(`401 auth olmadan: ${name}`, async () => {
        const ctx = createTestApp();
        const res = await send(ctx, op, 'none');
        expect(res.status).toBe(401);
        expectContract(res, op);
        expect(res.headers['www-authenticate'], 'WWW-Authenticate başlığı').toBeDefined();
      });
    }

    if (needsAdmin(op)) {
      it(`403 student ilə ADMIN endpoint: ${name}`, async () => {
        const ctx = createTestApp();
        const res = await send(ctx, op, 'student-bearer');
        expect(res.status).toBe(403);
        expectContract(res, op);
      });
    }

    const r = buildRequest(op);
    if (r.contentType === 'application/json' && r.body && typeof r.body === 'object' && !Array.isArray(r.body)) {
      it(`422 naməlum body sahəsi: ${name}`, async () => {
        const ctx = appFor(op);
        const res = await send(ctx, op, auth, { body: { ...(r.body as object), __unknown: 1 } });
        expect(res.status, JSON.stringify(res.body)).toBe(422);
        expectContract(res, op);
        expect(res.body.details.map((d: { field: string }) => d.field)).toContain('/__unknown');
      });
    }

    if (r.contentType === 'application/json' || r.contentType === 'application/x-www-form-urlencoded') {
      it(`413 100 KB-dan böyük body: ${name}`, async () => {
        const ctx = appFor(op);
        const big = 'x'.repeat(110 * 1024);
        const res = await send(ctx, op, auth, { body: r.contentType === 'application/json' ? { padding: big } : { padding: big } });
        expect(res.status, JSON.stringify(res.body)).toBe(413);
        expectContract(res, op);
      });
    }

    if (op.method === 'get' && !oauthFormat(op)) {
      it(`422 naməlum query parametri: ${name}`, async () => {
        const ctx = appFor(op);
        const res = await send(ctx, op, auth, { query: { pgae: '2' } });
        expect(res.status, JSON.stringify(res.body)).toBe(422);
        expectContract(res, op);
      });
    }
  }
});

describe('contract: ümumi qaydalar', () => {
  it('404 — naməlum yol vahid formatda', async () => {
    const { api } = createTestApp();
    const res = await api().get('/api/v1/no-such-thing');
    expect(res.status).toBe(404);
    expectErrorFormat(res);
  });

  it('405 — dəstəklənməyən metod Allow başlığı ilə', async () => {
    const { api } = createTestApp();
    const res = await api().delete('/api/v1/airports');
    expect(res.status).toBe(405);
    expectErrorFormat(res);
    expect(res.headers.allow).toContain('GET');
  });

  it('400 — sınıq JSON', async () => {
    const { api } = createTestApp();
    const res = await api().post('/api/v1/customers').set('Content-Type', 'application/json').send('{"firstName":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MALFORMED_JSON');
    expectErrorFormat(res);
  });

  it('415 — yanlış Content-Type', async () => {
    const { api } = createTestApp();
    const res = await api().post('/api/v1/customers').set('Content-Type', 'text/plain').send('salam');
    expect(res.status).toBe(415);
    expectErrorFormat(res);
  });

  it('406 — dəstəklənməyən Accept', async () => {
    const { api } = createTestApp();
    const res = await api().get('/api/v1/customers').set('Accept', 'text/csv');
    expect(res.status).toBe(406);
    expectErrorFormat(res);
  });

  it('422 — Idempotency-Key fərqli body ilə təkrar (IETF draft: 422 IDEMPOTENCY_KEY_REUSED)', async () => {
    const ctx = createTestApp();
    const op = operations.find((o) => o.operationId === 'createTransfer')!;
    const { body } = buildRequest(op);
    const token = (await ctx.login()).access_token;
    const post = (b: unknown) => ctx.api().post('/api/v1/transfers').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'contract-key-0001').send(b as object);
    const first = await post(body);
    expect(first.status).toBe(201);
    const replay = await post(body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const conflict = await post({ ...(body as object), amount: 1 });
    expect(conflict.status).toBe(422);
    expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expectErrorFormat(conflict);
  });

  it('429 — limit aşılanda Retry-After və vahid format', async () => {
    const ctx = createTestApp({ config: { rateLimit: { limit: 3, windowSec: 60 } } });
    let res!: request.Response;
    for (let i = 0; i < 4; i++) res = await ctx.api().get('/api/v1/airports');
    expect(res.status).toBe(429);
    expectErrorFormat(res);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('pagination — page/size sərhədləri və meta', async () => {
    const { api } = createTestApp();
    const ok = await api().get('/api/v1/customers?page=1&size=5');
    expect(ok.status).toBe(200);
    expectMatchesSpec(ok, 'listCustomers');
    for (const bad of ['page=0', 'size=0', 'size=1000', 'page=abc']) {
      const res = await api().get(`/api/v1/customers?${bad}`);
      expect(res.status, bad).toBe(422);
      expectErrorFormat(res);
    }
  });
});
