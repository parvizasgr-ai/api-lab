// Idempotency-Key: şəbəkə xətasından sonra client eyni sorğunu təhlükəsiz təkrarlaya bilsin.
//   * Eyni açar + eyni body → saxlanmış cavab qaytarılır (Idempotent-Replayed: true), handler İCRA OLUNMUR.
//   * Eyni açar + fərqli body → 422 IDEMPOTENCY_KEY_REUSED.
//   * Açar istifadəçi + endpoint üzrə unikaldır, 24 saat saxlanır. Yalnız uğurlu (2xx) cavablar saxlanılır —
//     xəta olarsa client düzəldib eyni açarla yenidən cəhd edə bilər.
import type { RequestHandler } from 'express';
import type { DB } from '../db.js';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { isoAfter, isoNow, sha256 } from '../lib/crypto.js';

export function idempotency(db: DB, config: Config): RequestHandler {
  const purge = db.prepare(`DELETE FROM idempotency_keys WHERE expires_at <= ?`);
  const find = db.prepare(`SELECT * FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?`);
  const save = db.prepare(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, response_status, response_body, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return (req, res, next) => {
    const key = req.valid.headers['idempotency-key'] as string | undefined;
    if (!key || !req.auth) return next();

    const now = config.now();
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const requestHash = sha256(JSON.stringify(req.valid.body ?? null));
    purge.run(isoNow(now));

    const stored = find.get(key, req.auth.userId, endpoint) as
      | { request_hash: string; response_status: number; response_body: string }
      | undefined;
    if (stored) {
      if (stored.request_hash !== requestHash) {
        throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', 'Bu Idempotency-Key fərqli sorğu ilə artıq istifadə olunub');
      }
      res.set('Idempotent-Replayed', 'true').status(stored.response_status).type('application/json').send(stored.response_body);
      return;
    }

    // Handler cavabını göndərəndə onu yadda saxlayırıq.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        save.run(key, req.auth!.userId, endpoint, requestHash, res.statusCode, JSON.stringify(body), isoNow(now), isoAfter(now, config.idempotencyTtlSec));
      }
      return originalJson(body);
    };
    next();
  };
}
