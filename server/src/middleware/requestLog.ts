// Hər API sorğusu request_log cədvəlinə yazılır (API Explorer "History", v_api_usage_by_endpoint view-u).
// Yazı cavab göndəriləndən SONRA ('finish' event) olur — status və müddət artıq məlumdur.
// Yazı asinxrondur: /_history (və testlər) oxumazdan əvvəl flushRequestLog() ilə gözləyən yazıları tamamlayır.
import type { RequestHandler } from 'express';
import type { DB } from '../db.js';
import { isoNow } from '../lib/crypto.js';
import type { Config } from '../config.js';

const pending = new Set<Promise<unknown>>();

// Cavabdan SONRA gedən digər yazılar da (məs. idempotency açarının buraxılması) eyni flush-a daxildir
export function trackAfterResponse(write: Promise<unknown>): void {
  const tracked = write.catch(() => undefined).finally(() => pending.delete(tracked));
  pending.add(tracked);
}

export async function flushRequestLog(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

export function requestLog(db: DB, config: Config): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      const write = db
        .prepare(
          `INSERT INTO request_log (request_id, user_id, method, path, route, status, duration_ms, ip, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.id,
          // login kimi tokensiz sorğularda handler res.locals.userId təyin edə bilər
          req.auth?.userId ?? res.locals.userId ?? null,
          req.method,
          req.originalUrl.split('?')[0],
          req.operation?.path ?? null,
          res.statusCode,
          Math.round(performance.now() - req.startedAt),
          req.ip ?? null,
          isoNow(config.now()),
        )
        .catch((err: Error) => console.error('[request_log] yazıla bilmədi:', err.message))
        .finally(() => pending.delete(write));
      pending.add(write);
    });
    next();
  };
}
