// Rate limit — fixed window (60 saniyəlik pəncərə), subyekt başına:
//   etibarlı Bearer token → 'user:<id>', etibarlı API key → 'apikey:<id>', əks halda → 'ip:<ip>'.
// Sayğac Redis-dədir (klassik INCR + EXPIRE nümunəsi): açar ratelimit:<subyekt>:<pəncərə başlanğıcı>, TTL = pəncərə.
// Tələbə portalda (Infrastruktur → Redis) və ya `GET ratelimit:*` ilə sayğacın artmasını və TTL-in azalmasını görür.
import type { Request, RequestHandler, Response } from 'express';
import type { OperationInfo } from '../openapi/spec.js';
import type { RedisSim } from '../infra/redis.js';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
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
function windowCounter(redis: RedisSim, config: Config) {
  const { windowSec } = config.rateLimit;
  return async (res: Response, subject: string, limit: number) => {
    const nowSec = Math.floor(config.now().getTime() / 1000);
    const windowStartSec = nowSec - (nowSec % windowSec);
    const key = `ratelimit:${subject}:${windowStartSec}`;
    const count = redis.incr(key);
    if (count === 1) redis.expire(key, windowSec); // pəncərə bitəndə açar özü silinir — təmizlik lazım deyil

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

export function rateLimit(redis: RedisSim, config: Config, auth: AuthService): RequestHandler {
  const count = windowCounter(redis, config);
  return async (req, res, next) => {
    // CORS preflight brauzerin özünün sorğusudur — limitə daxil etmirik.
    if (req.method === 'OPTIONS' && req.get('access-control-request-method')) return next();
    await count(res, await subjectOf(req, auth), config.rateLimit.limit);
    next();
  };
}

// Endpoint-ə xas, daha sərt limit (OpenAPI: x-rate-limit). Subyekt: operationId + istifadəçi/IP.
export function operationRateLimit(redis: RedisSim, config: Config) {
  const count = windowCounter(redis, config);
  return (op: OperationInfo): RequestHandler => {
    const limit: number | undefined = op.operation['x-rate-limit'];
    return async (req, res, next) => {
      if (limit) await count(res, `${op.operationId}:${req.auth ? `user:${req.auth.userId}` : `ip:${req.ip}`}`, limit);
      next();
    };
  };
}
