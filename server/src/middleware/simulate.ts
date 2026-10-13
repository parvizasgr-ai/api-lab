// Tədris simulyatoru: X-Simulate başlığı ilə xəta/gecikmə yaratmaq (retry, timeout, circuit breaker dərsi).
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function simulate(config: Config): RequestHandler {
  return async (req, _res, next) => {
    const mode = req.get('x-simulate')?.trim().toLowerCase();
    if (!mode || !config.simulate.enabled) return next();
    // "hotels:503" — bölməyə yönəlmiş simulyasiya, BFF özü emal edir
    if (mode.includes(':')) {
      if (req.originalUrl.startsWith('/bff/')) return next();
      throw new ApiError(422, 'VALIDATION_ERROR', 'Bölməyə yönəlmiş X-Simulate yalnız /bff endpoint-lərində işləyir', [
        { field: 'header X-Simulate', message: 'Məs. /bff/travel/search üçün X-Simulate: hotels:503' },
      ]);
    }
    switch (mode) {
      case '500':
        throw new ApiError(500, 'SIMULATED_ERROR', 'X-Simulate: 500 ilə yaradılmış test xətası');
      case '503':
        throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Servis müvəqqəti əlçatan deyil (X-Simulate: 503)', [], { 'Retry-After': '5' });
      case 'slow':
        await sleep(config.simulate.slowMs);
        return next();
      case 'timeout':
        await sleep(config.simulate.timeoutMs);
        throw new ApiError(504, 'GATEWAY_TIMEOUT', 'Upstream servis vaxtında cavab vermədi (X-Simulate: timeout)');
      default:
        throw new ApiError(422, 'VALIDATION_ERROR', 'Naməlum X-Simulate dəyəri', [
          { field: 'header X-Simulate', message: 'İcazəli dəyərlər: 500, 503, slow, timeout' },
        ]);
    }
  };
}
