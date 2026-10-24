// SQL Playground: sxem (introspection) və yalnız-oxu sorğuları — real PostgreSQL üzərində.
// Təhlükəsizlik qatları (hər biri ayrılıqda kifayətdir, birlikdə — dərinlikli müdafiə):
//   1. guard.ts — yalnız 1 SELECT/WITH statement, LIMIT tətbiqi
//   2. ayrıca LOGIN rolu apilab_playground — yazma hüququ yoxdur, sirr sütunlu cədvəllərə yalnız maskalı lab.* view-lar
//   3. hər sorğu: BEGIN READ ONLY + SET LOCAL statement_timeout + ROLLBACK (set_config dəyişiklikləri də geri qaytarılır)
import type { Request } from 'express';
import pg from 'pg';
import type { AppContext } from '../../app.js';
import { ApiError } from '../../errors.js';
import { writeAudit } from '../../lib/audit.js';
import { guardQuery } from './guard.js';
import { isHidden } from './hidden.js';

// Bir proses daxilində eyni DB üçün bir playground pool (testlərdə hər DB-nin öz pool-u)
const pools = new Map<string, pg.Pool>();

export function playgroundPool(databaseUrl: string, password: string): pg.Pool {
  const url = new URL(databaseUrl);
  url.username = 'apilab_playground';
  url.password = password;
  const key = url.toString();
  let pool = pools.get(key);
  if (!pool) {
    pool = new pg.Pool({ connectionString: key, max: 3, idleTimeoutMillis: 1_000, options: '-c timezone=UTC' });
    pool.on('error', () => undefined);
    pools.set(key, pool);
  }
  return pool;
}

export async function closePlaygroundPools(): Promise<void> {
  await Promise.all([...pools.values()].map((p) => p.end().catch(() => undefined)));
  pools.clear();
}

// PostgreSQL xəta kodu → API xətası
function mapError(err: unknown, timeoutMs: number): ApiError {
  const e = err as { code?: string; message?: string };
  if (e.code === '57014') return new ApiError(422, 'SQL_TIMEOUT', `Sorğu ${timeoutMs} ms-dən çox çəkdi və dayandırıldı`);
  if (e.code === '42501' || e.code === '25006') return new ApiError(422, 'SQL_NOT_ALLOWED', 'Yalnız SELECT sorğularına icazə verilir', [{ field: 'sql', message: e.message ?? '' }]);
  if (e.code === 'ECONNREFUSED' || e.code === '28P01') return new ApiError(503, 'SERVICE_UNAVAILABLE', 'SQL Playground DB-yə qoşula bilmədi');
  return new ApiError(422, 'SQL_SYNTAX_ERROR', e.message ?? 'SQL xətası');
}

export class SqlPlaygroundService {
  constructor(private ctx: AppContext) {}

  private get pool() {
    return playgroundPool(this.ctx.db.url, this.ctx.config.playgroundPassword);
  }

  async schema() {
    const db = this.ctx.db;
    const objects = (await db
      .prepare(
        `SELECT table_name AS name, CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END AS type
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
         ORDER BY type, name`,
      )
      .all()) as { name: string; type: 'table' | 'view' }[];
    const columns = (await db
      .prepare(
        `SELECT c.table_name, c.column_name AS name, upper(c.data_type) AS type, c.is_nullable = 'NO' AS not_null,
                EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                        WHERE tc.table_schema = 'public' AND tc.table_name = c.table_name AND tc.constraint_type = 'PRIMARY KEY'
                          AND k.column_name = c.column_name) AS primary_key
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
         ORDER BY c.table_name, c.ordinal_position`,
      )
      .all()) as { table_name: string; name: string; type: string; not_null: boolean; primary_key: boolean }[];
    const fks = (await db
      .prepare(
        `SELECT cl.relname AS table_name, a.attname AS "column", rc.relname AS ref_table, ra.attname AS ref_column
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
         JOIN pg_class rc ON rc.oid = con.confrelid
         CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(col, refcol)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.col
         JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = k.refcol
         WHERE con.contype = 'f'
         ORDER BY cl.relname, con.conname`,
      )
      .all()) as { table_name: string; column: string; ref_table: string; ref_column: string }[];
    const indexes = (await db
      .prepare(
        `SELECT t.relname AS table_name, i.relname AS name, ix.indisunique AS "unique",
                array_agg(a.attname::text ORDER BY k.ord) AS columns
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
         JOIN pg_class i ON i.oid = ix.indexrelid
         CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
         GROUP BY t.relname, i.relname, ix.indisunique
         ORDER BY t.relname, i.relname`,
      )
      .all()) as { table_name: string; name: string; unique: boolean; columns: string[] }[];

    const tables = [];
    for (const o of objects) {
      tables.push({
        name: o.name,
        type: o.type,
        rowCount: o.type === 'table' ? ((await db.prepare(`SELECT COUNT(*) FROM "${o.name}"`).pluck().get()) as number) : null,
        columns: columns
          .filter((c) => c.table_name === o.name)
          .map((c) => ({ name: c.name, type: c.type, notNull: c.not_null, primaryKey: c.primary_key, hidden: isHidden(o.name, c.name) })),
        foreignKeys: fks.filter((f) => f.table_name === o.name).map((f) => ({ column: f.column, refTable: f.ref_table, refColumn: f.ref_column })),
        indexes: indexes.filter((ix) => ix.table_name === o.name).map((ix) => ({ name: ix.name, columns: ix.columns, unique: ix.unique })),
      });
    }
    return { tables };
  }

  // Maskalı lab.* view-ların gizli sütunlarının (OID, attnum) cütləri — nəticədən çıxarılır və hiddenColumns-da göstərilir
  private async hiddenAttributes(client: pg.PoolClient): Promise<Map<string, string>> {
    const rows = (
      await client.query(
        `SELECT c.oid AS table_id, a.attnum AS column_id, c.relname || '.' || a.attname AS origin
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'lab'
         JOIN pg_attribute a ON a.attrelid = c.oid
         WHERE c.relkind = 'v' AND a.attnum > 0`,
      )
    ).rows as { table_id: number; column_id: number; origin: string }[];
    return new Map(rows.filter((r) => isHidden(r.origin.split('.')[0], r.origin.split('.')[1])).map((r) => [`${r.table_id}:${r.column_id}`, r.origin]));
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
      const result = await this.execute(executedSql);
      await audit('OK', result.rows.length);
      return { ...result, rowCount: result.rows.length, executedSql };
    } catch (err) {
      await audit(err instanceof ApiError ? err.code : 'INTERNAL_ERROR');
      throw err;
    }
  }

  private async execute(sql: string) {
    const { timeoutMs, maxRows, maxBytes } = this.ctx.config.sqlPlayground;
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      throw mapError(err, timeoutMs);
    }
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${Number(timeoutMs)}`);
      await client.query(`SET LOCAL search_path = lab, public`);
      const hidden = await this.hiddenAttributes(client);
      const started = performance.now();
      let result: pg.QueryArrayResult;
      try {
        // rowMode 'array' — eyni adlı sütunlar (JOIN) itməsin; values: [] — extended protocol (tək statement)
        result = await client.query({ text: sql, values: [], rowMode: 'array' });
      } catch (err) {
        throw mapError(err, timeoutMs);
      }
      const durationMs = Math.round(performance.now() - started);

      const seen = new Map<string, number>();
      const columns = result.fields.map((f) => {
        const n = seen.get(f.name) ?? 0;
        seen.set(f.name, n + 1);
        const origin = hidden.get(`${f.tableID}:${f.columnID}`);
        return { name: n ? `${f.name}_${n + 1}` : f.name, hidden: origin !== undefined, origin };
      });

      const rows: Record<string, unknown>[] = [];
      let bytes = 0;
      let truncated = false;
      for (const raw of result.rows) {
        if (rows.length === maxRows) {
          truncated = true;
          break;
        }
        const row: Record<string, unknown> = {};
        raw.forEach((v, i) => {
          if (!columns[i].hidden) row[columns[i].name] = Buffer.isBuffer(v) ? `<bytea ${v.length} bytes>` : v instanceof Date ? v.toISOString() : v;
        });
        bytes += JSON.stringify(row).length;
        if (bytes > maxBytes) {
          truncated = true;
          break;
        }
        rows.push(row);
      }
      return {
        columns: columns.filter((c) => !c.hidden).map((c) => c.name),
        rows,
        truncated,
        durationMs,
        hiddenColumns: [...new Set(columns.filter((c) => c.hidden).map((c) => c.origin!))],
      };
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }
}
