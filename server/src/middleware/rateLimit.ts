// Rate limit — fixed window (60 saniyəlik pəncərə), subyekt başına:
//   etibarlı Bearer token → 'user:<id>', etibarlı API key → 'apikey:<id>', əks halda → 'ip:<ip>'.
// Sayğac DB-dədir (rate_limit_counters) — tələbələr SELECT ilə görə bilir.
import type { Request, RequestHandler, Response } from 'express';
import type { OperationInfo } from '../openapi/spec.js';
import type { DB } from '../db.js';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { isoNow } from '../lib/crypto.js';
import type { AuthService } from '../modules/auth/service.js';

async function subjectOf(req: Request, auth: AuthService): Promise<string> {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const user = await auth.verifyAccessToken(header.slice(7)).catch(() => undefined);
    if (user) return `user:${user.userId}`;
  }
  const apiKey = req.get('x-api-key');
  if (apiKey) {
    const key = await auth.findActiveApiKey(apiKey);
    if (key) return `apikey:${key.id}`;
  }
  return `ip:${req.ip}`;
}

// Fixed window sayğacı: count > limit → 429. Ümumi limit və endpoint-ə xas (x-rate-limit) limit eyni məntiqdən istifadə edir.
function windowCounter(db: DB, config: Config) {
  const { windowSec } = config.rateLimit;
  const increment = db.prepare(
    `INSERT INTO rate_limit_counters (subject, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (subject, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
     RETURNING count`,
  );
  const cleanup = db.prepare(`DELETE FROM rate_limit_counters WHERE subject = ? AND window_start < ?`);

  return async (res: Response, subject: string, limit: number) => {
    const nowSec = Math.floor(config.now().getTime() / 1000);
    const windowStartSec = nowSec - (nowSec % windowSec);
    const windowStart = isoNow(new Date(windowStartSec * 1000));
    const { count } = (await increment.get(subject, windowStart)) as { count: number };
    if (count === 1) await cleanup.run(subject, isoNow(new Date((windowStartSec - 3600) * 1000)));

    const reset = windowStartSec + windowSec;
    res.set({
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, limit - count)),
      'X-RateLimit-Reset': String(reset),
    });
    if (count > limit) {
      const retryAfter = Math.max(1, reset - nowSec);
      throw new ApiError(429, 'TOO_MANY_REQUESTS', `Çox sayda sorğu — ${retryAfter} saniyə sonra yenidən cəhd edin`, [], {
        'Retry-After': String(retryAfter),
      });
    }
  };
}

export function rateLimit(db: DB, config: Config, auth: AuthService): RequestHandler {
  const count = windowCounter(db, config);
  return async (req, res, next) => {
    // CORS preflight brauzerin özünün sorğusudur — limitə daxil etmirik.
    if (req.method === 'OPTIONS' && req.get('access-control-request-method')) return next();
    await count(res, await subjectOf(req, auth), config.rateLimit.limit);
    next();
  };
}

// Endpoint-ə xas, daha sərt limit (OpenAPI: x-rate-limit). Subyekt: operationId + istifadəçi/IP.
export function operationRateLimit(db: DB, config: Config) {
  const count = windowCounter(db, config);
  return (op: OperationInfo): RequestHandler => {
    const limit: number | undefined = op.operation['x-rate-limit'];
    return async (req, res, next) => {
      if (limit) await count(res, `${op.operationId}:${req.auth ? `user:${req.auth.userId}` : `ip:${req.ip}`}`, limit);
      next();
    };
  };
}
