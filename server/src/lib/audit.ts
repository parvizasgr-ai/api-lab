// audit_log-a yazı: "kim, nə vaxt, nəyi etdi" (təhlükəsizlik və mübahisəli hallar üçün).
import type { Request } from 'express';
import type { DB } from '../db.js';
import { isoNow } from './crypto.js';

export function writeAudit(
  db: DB,
  req: Request,
  now: Date,
  entry: { userId?: number | null; action: string; entity: string; entityId: string | number; details?: unknown },
): Promise<unknown> {
  return db.prepare(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.userId ?? req.auth?.userId ?? null,
    entry.action,
    entry.entity,
    String(entry.entityId),
    entry.details === undefined ? null : JSON.stringify(entry.details),
    req.ip ?? null,
    req.id,
    isoNow(now),
  );
}
