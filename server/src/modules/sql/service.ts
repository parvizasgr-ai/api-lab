// SQL Playground: sxem (introspection) və yalnız-oxu sorğuları.
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { ApiError } from '../../errors.js';
import { writeAudit } from '../../lib/audit.js';
import { guardQuery } from './guard.js';
import { isHidden } from './hidden.js';
import { runInWorker } from './runner.js';

export class SqlPlaygroundService {
  constructor(private ctx: AppContext) {}

  schema() {
    const db = this.ctx.db;
    const objects = db
      .prepare(`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)
      .all() as { name: string; type: 'table' | 'view' }[];
    return {
      tables: objects.map((o) => ({
        name: o.name,
        type: o.type,
        rowCount: o.type === 'table' ? (db.prepare(`SELECT COUNT(*) FROM "${o.name}"`).pluck().get() as number) : null,
        columns: (db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info(?) ORDER BY cid`).all(o.name) as { name: string; type: string; notnull: number; pk: number }[]).map(
          (c) => ({ name: c.name, type: c.type, notNull: c.notnull === 1, primaryKey: c.pk > 0, hidden: isHidden(o.name, c.name) }),
        ),
        foreignKeys: (db.prepare(`SELECT "from", "table", "to" FROM pragma_foreign_key_list(?) ORDER BY id, seq`).all(o.name) as { from: string; table: string; to: string }[]).map(
          (f) => ({ column: f.from, refTable: f.table, refColumn: f.to }),
        ),
        indexes: (db.prepare(`SELECT name, "unique" FROM pragma_index_list(?) ORDER BY name`).all(o.name) as { name: string; unique: number }[]).map((ix) => ({
          name: ix.name,
          columns: db.prepare(`SELECT name FROM pragma_index_info(?) ORDER BY seqno`).pluck().all(ix.name) as string[],
          unique: ix.unique === 1,
        })),
      })),
    };
  }

  async query(req: Request, sql: string) {
    const limits = this.ctx.config.sqlPlayground;
    const audit = (result: string, rowCount?: number) =>
      writeAudit(this.ctx.db, req, this.ctx.config.now(), {
        action: 'SQL_QUERY',
        entity: 'sql_playground',
        entityId: 'query',
        details: { sql: sql.slice(0, 500), result, ...(rowCount === undefined ? {} : { rowCount }) },
      });
    try {
      const { executedSql } = guardQuery(sql, limits.maxRows);
      const result = await runInWorker(this.ctx.db.serialize(), executedSql, limits);
      audit('OK', result.rows.length);
      return {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        truncated: result.truncated,
        durationMs: result.durationMs,
        hiddenColumns: result.hiddenColumns,
        executedSql,
      };
    } catch (err) {
      audit(err instanceof ApiError ? err.code : 'INTERNAL_ERROR');
      throw err;
    }
  }
}
