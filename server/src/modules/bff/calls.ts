// BFF daxili çağırış "wrapper"-i: ad, müddət, status, timeout və bölməyə yönəlmiş X-Simulate.
// Service layer birbaşa (funksiya kimi) çağırılır — HTTP-yə yenidən çıxmırıq, amma nəticə HTTP kimi təsvir olunur.
import type { Request } from 'express';
import type { Config } from '../../config.js';
import { ApiError } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';

export interface CallRecord {
  name: string;
  status: number;
  durationMs: number;
}

export type CallResult<T> = { ok: true; status: 200; data: T; record: CallRecord } | { ok: false; status: number; error: ReturnType<typeof errorBody>; record: CallRecord };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "X-Simulate: hotels:503, flights:slow" → { hotels: '503', flights: 'slow' }
export function partSimulations(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.get('x-simulate') ?? '').toLowerCase().split(',')) {
    const [name, mode] = part.split(':').map((s) => s.trim());
    if (name && mode) out[name] = mode;
  }
  return out;
}

function errorBody(err: ApiError, traceId: string, config: Config) {
  return { timestamp: isoNow(config.now()), status: err.status, code: err.code, message: err.message, details: err.details, traceId };
}

export async function runCall<T>(req: Request, config: Config, name: string, fn: () => T | Promise<T>): Promise<CallResult<T>> {
  const part = name.split('.')[0];
  const mode = partSimulations(req)[name] ?? partSimulations(req)[part];
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;

  const work = (async () => {
    if (mode === '500') throw new ApiError(500, 'SIMULATED_ERROR', `X-Simulate: ${part}:500 ilə yaradılmış test xətası`);
    if (mode === '503') throw new ApiError(503, 'SERVICE_UNAVAILABLE', `${part} servisi müvəqqəti əlçatan deyil (X-Simulate: ${part}:503)`);
    if (mode === 'slow') await sleep(config.simulate.slowMs);
    if (mode === 'timeout') await sleep(config.bffCallTimeoutMs * 2);
    return fn();
  })();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(504, 'GATEWAY_TIMEOUT', `${name} ${config.bffCallTimeoutMs} ms ərzində cavab vermədi`)), config.bffCallTimeoutMs);
  });

  try {
    const data = await Promise.race([work, timeout]);
    return { ok: true, status: 200, data, record: { name, status: 200, durationMs: Math.round(performance.now() - started) } };
  } catch (err) {
    let apiError: ApiError;
    if (err instanceof ApiError) apiError = err;
    else {
      console.error(`[${req.id}] BFF ${name}:`, err);
      apiError = new ApiError(500, 'INTERNAL_ERROR', `${name} gözlənilməz xəta verdi`);
    }
    return {
      ok: false,
      status: apiError.status,
      error: errorBody(apiError, `${req.id}.${part}`, config), // hər bölmənin öz traceId-si
      record: { name, status: apiError.status, durationMs: Math.round(performance.now() - started) },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function meta(started: number, results: CallResult<unknown>[]) {
  return {
    calls: results.map((r) => r.record),
    totalMs: Math.round(performance.now() - started),
    partial: results.some((r) => !r.ok),
  };
}
