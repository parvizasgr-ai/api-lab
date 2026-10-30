// Callbox AI (Gemini): retry/backoff (429, 503), model fallback (404), xəta xəritəsi, endpoint davranışı.
// Real Google-a sorğu getmir — GenerateFn saxtadır, gözləmə (sleep) qeyd olunur.
import { describe, expect, it } from 'vitest';
import { config as baseConfig } from '../server/src/config.js';
import { backoffDelay, errorInfo, GeminiService, type GenerateFn } from '../server/src/modules/ai/gemini.js';
import { createTestApp, expectMatchesSpec } from './helpers.js';

const httpError = (status: number, message = `{"error":{"code":${status}}}`) => Object.assign(new Error(message), { status });
const options = { ...baseConfig.ai, apiKey: 'test', model: 'gemini-2.5-flash', fallbackModels: ['gemini-3.8-flash'], systemInstruction: 'test' };

function service(script: ((model: string) => unknown)[]) {
  const calls: string[] = [];
  const waits: number[] = [];
  const generate: GenerateFn = async ({ model }) => {
    calls.push(model);
    const step = script[calls.length - 1] ?? (() => 'ok');
    const out = step(model);
    if (out instanceof Error) throw out;
    return { text: String(out) };
  };
  return { svc: new GeminiService(options, generate, async (ms) => void waits.push(ms)), calls, waits };
}

const ask = [{ role: 'user' as const, text: 'Salam' }];

describe('GeminiService', () => {
  it('429 → backoff ilə təkrar, üçüncü cəhddə uğur; attempts sayılır', async () => {
    const { svc, calls, waits } = service([() => httpError(429), () => httpError(429), () => 'cavab']);
    const res = await svc.chat(ask);
    expect(res).toMatchObject({ text: 'cavab', model: 'gemini-2.5-flash', attempts: 3 });
    expect(calls).toHaveLength(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThanOrEqual(waits[0] / 2); // exponential (jitter ilə)
  });

  it('Google retryDelay verirsə ona əməl olunur (maxDelay ilə məhdud)', async () => {
    const { svc, waits } = service([() => httpError(429, '{"error":{"details":[{"retryDelay":"7s"}]}}'), () => 'ok']);
    await svc.chat(ask);
    expect(waits).toEqual([7000]);
  });

  it('429 bütün cəhdlərdə (fallback daxil) → 429 AI_RATE_LIMITED + Retry-After; 503 də təkrar olunur', async () => {
    const { svc, calls } = service(Array.from({ length: 20 }, () => () => httpError(429)));
    await expect(svc.chat(ask)).rejects.toMatchObject({ status: 429, code: 'AI_RATE_LIMITED', headers: { 'Retry-After': '30' } });
    // hər model üçün 1 + maxRetries cəhd (əsas + fallback)
    expect(calls).toEqual([...Array(options.maxRetries + 1).fill('gemini-2.5-flash'), ...Array(options.maxRetries + 1).fill('gemini-3.8-flash')]);
    const busy = service([() => httpError(503), () => 'ok']);
    expect((await busy.svc.chat(ask)).attempts).toBe(2);
  });

  it('404 (model bağlıdır) → fallback modelə keçir və sonrakı sorğularda bağlı modeli sınamır', async () => {
    const { svc, calls } = service([() => httpError(404), () => 'fallback', () => 'yenə']);
    expect((await svc.chat(ask)).model).toBe('gemini-3.8-flash');
    await svc.chat(ask);
    expect(calls).toEqual(['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.8-flash']);
    expect(svc.model).toBe('gemini-3.8-flash');
  });

  it('təkrar olunmayan xətalar dərhal: 500 → 502 AI_UPSTREAM_ERROR, timeout → 504, açar yoxdur → 503', async () => {
    const { svc, calls } = service([() => httpError(500)]);
    await expect(svc.chat(ask)).rejects.toMatchObject({ status: 502, code: 'AI_UPSTREAM_ERROR' });
    expect(calls).toHaveLength(1);
    const timeout = service([() => Object.assign(new Error('Request timed out'), { name: 'AbortError' })]);
    await expect(timeout.svc.chat(ask)).rejects.toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
    await expect(new GeminiService({ ...options, apiKey: '' }).chat(ask)).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' });
  });

  it('backoffDelay və errorInfo', () => {
    expect(backoffDelay(0, 1000, 20000, null, () => 0)).toBe(500);
    expect(backoffDelay(3, 1000, 20000, null, () => 1)).toBe(8000);
    expect(backoffDelay(10, 1000, 20000, null, () => 1)).toBe(20000);
    expect(errorInfo(httpError(429, '"retryDelay": "12.5s"'))).toMatchObject({ status: 429, retryDelayMs: 12500 });
  });
});

describe('POST /api/v1/ai/chat', () => {
  it('token ilə: cavab qaytarır, son 30 mesaj göndərilir; açar request_log-a düşmür', async () => {
    let sent = 0;
    const t = createTestApp({ aiGenerator: async ({ messages }) => ((sent = messages.length), { text: 'Salam, tələbə!' }) });
    const { access_token } = await t.login();
    const messages = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `m${i}` }));
    const res = await t.api().post('/api/v1/ai/chat').set('Authorization', `Bearer ${access_token}`).send({ messages });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'aiChat');
    expect(res.body.reply).toEqual({ role: 'model', text: 'Salam, tələbə!' });
    expect(sent).toBe(30);
    const status = await t.api().get('/api/v1/ai/status').set('Authorization', `Bearer ${access_token}`);
    expect(status.body).toMatchObject({ configured: true });
    expect(JSON.stringify(status.body)).not.toContain('apiKey');
  });

  it('token-siz 401; son mesaj model → 422; 4000+ simvol → 422; açar yoxdur → 503 AI_NOT_CONFIGURED', async () => {
    const t = createTestApp();
    expect((await t.api().post('/api/v1/ai/chat').send({ messages: [{ role: 'user', text: 'x' }] })).status).toBe(401);
    const h = { Authorization: `Bearer ${(await t.login()).access_token}` };
    expect((await t.api().post('/api/v1/ai/chat').set(h).send({ messages: [{ role: 'model', text: 'x' }] })).status).toBe(422);
    expect((await t.api().post('/api/v1/ai/chat').set(h).send({ messages: [{ role: 'user', text: 'x'.repeat(4001) }] })).status).toBe(422);
    const off = createTestApp({ aiGenerator: null });
    const res = await off.api().post('/api/v1/ai/chat').set('Authorization', `Bearer ${(await off.login()).access_token}`).send({ messages: [{ role: 'user', text: 'Salam' }] });
    expect([res.status, res.body.code]).toEqual([503, 'AI_NOT_CONFIGURED']);
  });

  it('istifadəçi başına 10 sorğu/dəq → 11-ci 429', async () => {
    const t = createTestApp();
    const h = { Authorization: `Bearer ${(await t.login()).access_token}` };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await t.api().post('/api/v1/ai/chat').set(h).send({ messages: [{ role: 'user', text: `s${i}` }] })).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
