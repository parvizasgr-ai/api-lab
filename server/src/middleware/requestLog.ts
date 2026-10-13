// Hər API sorğusu request_log cədvəlinə yazılır (API Explorer "History", v_api_usage_by_endpoint view-u).
// Yazı cavab göndəriləndən SONRA ('finish' event) olur — status və müddət artıq məlumdur.
import type { RequestHandler } from 'express';
import type { DB } from '../db.js';
import { isoNow } from '../lib/crypto.js';
import type { Config } from '../config.js';

export function requestLog(db: DB, config: Config): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      try {
        db.prepare(
          `INSERT INTO request_log (request_id, user_id, method, path, route, status, duration_ms, ip, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          req.id,
          req.auth?.userId ?? null,
          req.method,
          req.originalUrl.split('?')[0],
          req.operation?.path ?? null,
          res.statusCode,
          Math.round(performance.now() - req.startedAt),
          req.ip ?? null,
          isoNow(config.now()),
        );
      } catch (err) {
        console.error('[request_log] yazıla bilmədi:', (err as Error).message);
      }
    });
    next();
  };
}
