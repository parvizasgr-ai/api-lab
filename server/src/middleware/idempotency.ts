// Idempotency-Key: şəbəkə xətasından sonra client eyni sorğunu təhlükəsiz təkrarlaya bilsin.
//   * Eyni açar + eyni body → saxlanmış cavab qaytarılır (Idempotent-Replayed: true), handler İCRA OLUNMUR.
//   * Eyni açar + fərqli body → 422 IDEMPOTENCY_KEY_REUSED.
//   * Açar istifadəçi + endpoint üzrə unikaldır, 24 saat saxlanır. Yalnız uğurlu (2xx) cavablar saxlanılır —
//     xəta olarsa client düzəldib eyni açarla yenidən cəhd edə bilər.
//   * Paralel eyni sorğular: açar handler-dən ƏVVƏL "pending" kimi tutulur (INSERT ... ON CONFLICT DO NOTHING).
//     İkinci sorğu birincinin bitməsini gözləyir və onun cavabını alır — əməliyyat iki dəfə icra olunmur.
import type { RequestHandler } from 'express';
import type { DB } from '../db.js';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { isoAfter, isoNow, sha256 } from '../lib/crypto.js';
import { trackAfterResponse } from './requestLog.js';

type Stored = { request_hash: string; response_status: number | null; response_body: string | null };

const WAIT_STEP_MS = 50;
const WAIT_MAX_MS = 10_000;

export function idempotency(db: DB, config: Config): RequestHandler {
  const purge = db.prepare(`DELETE FROM idempotency_keys WHERE expires_at <= ?`);
  const claim = db.prepare(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING key`,
  );
  const find = db.prepare(`SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ?`);
  const complete = db.prepare(`UPDATE idempotency_keys SET response_status = ?, response_body = ? WHERE key = ? AND user_id = ? AND endpoint = ?`);
  const release = db.prepare(`DELETE FROM idempotency_keys WHERE key = ? AND user_id = ? AND endpoint = ? AND response_status IS NULL`);

  return async (req, res, next) => {
    const key = req.valid.headers['idempotency-key'] as string | undefined;
    if (!key || !req.auth) return next();

    const now = config.now();
    const userId = req.auth.userId;
    const endpoint = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const requestHash = sha256(JSON.stringify(req.valid.body ?? null));
    await purge.run(isoNow(now));

    const claimed = await claim.get(key, userId, endpoint, requestHash, isoNow(now), isoAfter(now, config.idempotencyTtlSec));
    if (!claimed) {
      // Açar artıq var: ya tamamlanıb (replay), ya da paralel sorğu hələ icra edir (gözləyirik)
      for (let waited = 0; ; waited += WAIT_STEP_MS) {
        const stored = (await find.get(key, userId, endpoint)) as Stored | undefined;
        if (!stored) return next(); // pending sahibi uğursuz oldu və açarı buraxdı — bu sorğu yenidən icra edir
        if (stored.request_hash !== requestHash) {
          throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', 'Bu Idempotency-Key fərqli sorğu ilə artıq istifadə olunub');
        }
        if (stored.response_status !== null) {
          res.set('Idempotent-Replayed', 'true').status(stored.response_status).type('application/json').send(stored.response_body);
          return;
        }
        if (waited >= WAIT_MAX_MS) throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Eyni Idempotency-Key ilə sorğu hələ icra olunur');
        await new Promise((r) => setTimeout(r, WAIT_STEP_MS));
      }
    }

    // Bu sorğu açarın sahibidir: uğurlu cavab saxlanılır, uğursuzluqda açar buraxılır (client yenidən cəhd edə bilsin)
    let saved: Promise<unknown> | null = null;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Cavab dərhal göndərilir; saxlanma paralel gedir — gözləyən təkrar sorğular statusu sorğulayır
        saved = complete.run(res.statusCode, JSON.stringify(body), key, userId, endpoint).catch((err: Error) => console.error('[idempotency]', err.message));
        trackAfterResponse(saved);
      }
      return originalJson(body);
    };
    res.on('finish', () => {
      if (!saved) trackAfterResponse(release.run(key, userId, endpoint));
    });
    next();
  };
}
