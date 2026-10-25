// DB qatı: PostgreSQL + raw SQL (ORM yoxdur — tələbələr SQL-i birbaşa görsün).
//   * prepare(sql).get/all/run — async; SQL-də `?` (sıra ilə) və ya `@ad` (obyektlə) parametrləri $1, $2 … -yə çevrilir.
//   * transaction(fn) — fn daxilindəki BÜTÜN sorğular avtomatik eyni bağlantıda gedir (AsyncLocalStorage).
//     .immediate() — əlavə olaraq qlobal advisory lock: yazma əməliyyatları ardıcıl icra olunur (köçürmə, idempotency).
//   * Migration = db/migrations/*.sql (schema_migrations cədvəlində qeyd olunur), seed = db/seed/*.sql.
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from './config.js';

// COUNT(*), SUM(...) bigint/numeric qaytarır — JS number kimi oxuyuruq (dəyərlərimiz 2^53-dən çox kiçikdir)
pg.types.setTypeParser(20, (v) => Number(v)); // int8
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

const WRITE_LOCK = 4242; // pg_advisory_xact_lock açarı (".immediate" tranzaksiyaları)

export interface RunResult {
  changes: number;
  lastInsertRowid: number | undefined;
}

// `?` və `@ad` → $n. Dırnaq içi ('...', "..."), şərhlər (-- , /* */) və $$...$$ toxunulmur; `::type` cast-ları da.
export function convertPlaceholders(sql: string): { text: string; names: string[]; positional: number } {
  let out = '';
  const names: string[] = [];
  let positional = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      const stop = end < 0 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end < 0 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '$' && next === '$') {
      const end = sql.indexOf('$$', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '?') {
      out += `$${++positional}`;
      i++;
      continue;
    }
    if (c === '@' && /[A-Za-z_]/.test(next ?? '')) {
      const m = /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i))!;
      let idx = names.indexOf(m[1]);
      if (idx < 0) idx = names.push(m[1]) - 1;
      out += `$${idx + 1}`;
      i += m[0].length;
      continue;
    }
    out += c;
    i++;
  }
  return { text: out, names, positional };
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<pg.QueryResult> };

export class Statement<Row = any> {
  private converted: ReturnType<typeof convertPlaceholders>;
  private mode: 'row' | 'pluck' | 'raw' = 'row';

  constructor(
    private db: DB,
    private sql: string,
  ) {
    this.converted = convertPlaceholders(sql);
  }

  pluck() {
    this.mode = 'pluck';
    return this;
  }

  raw() {
    this.mode = 'raw';
    return this;
  }

  private values(args: unknown[]): unknown[] {
    const { names, positional } = this.converted;
    if (!names.length && !positional) return []; // SQL-də parametr yoxdur — ötürülən obyekt/arqumentlər nəzərə alınmır
    if (names.length) {
      const obj = (args[0] ?? {}) as Record<string, unknown>;
      return names.map((n) => normalize(obj[n]));
    }
    return args.flat().slice(0, positional).map(normalize);
  }

  private async exec(args: unknown[], text = this.converted.text): Promise<pg.QueryResult> {
    return this.db.query(text, this.values(args));
  }

  private shape(result: pg.QueryResult): any[] {
    if (this.mode === 'pluck') return result.rows.map((r) => r[result.fields[0].name]);
    if (this.mode === 'raw') return result.rows.map((r) => result.fields.map((f) => r[f.name]));
    return result.rows;
  }

  async get(...args: unknown[]): Promise<Row | undefined> {
    return this.shape(await this.exec(args))[0];
  }

  async all(...args: unknown[]): Promise<Row[]> {
    return this.shape(await this.exec(args));
  }

  // INSERT-də RETURNING yoxdursa, avtomatik "RETURNING *" — lastInsertRowid = yeni sətrin id-si
  async run(...args: unknown[]): Promise<RunResult> {
    let text = this.converted.text;
    if (/^\s*INSERT\b/i.test(text) && !/\bRETURNING\b/i.test(text)) text = `${text.replace(/;\s*$/, '')} RETURNING *`;
    const result = await this.exec(args, text);
    return { changes: result.rowCount ?? 0, lastInsertRowid: result.rows[0]?.id };
  }
}

// Bayraq sütunları INTEGER (0/1) — true/false da 1/0-a çevrilir
const normalize = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export interface TransactionFn<A extends unknown[], R> {
  (...args: A): Promise<R>;
  immediate: (...args: A) => Promise<R>;
}

export class DB {
  readonly pool: pg.Pool;
  private als = new AsyncLocalStorage<pg.PoolClient>();
  private readyPromise: Promise<void>;
  readonly database: string;
  readonly url: string;

  constructor(connectionString = config.databaseUrl, options: { ready?: Promise<void>; max?: number; idleTimeoutMillis?: number } = {}) {
    this.url = connectionString;
    // timezone=UTC: CURRENT_DATE/now() seed və API ilə eyni gün (yerli saat qurşağı axşam saatlarında fərqli gün verərdi)
    this.pool = new pg.Pool({ connectionString, max: options.max ?? 10, idleTimeoutMillis: options.idleTimeoutMillis ?? 10_000, options: '-c timezone=UTC' });
    this.pool.on('error', (err) => console.error('[db] boş bağlantı xətası:', err.message));
    this.readyPromise = options.ready ?? Promise.resolve();
    this.database = new URL(connectionString).pathname.slice(1);
  }

  get ready() {
    return this.readyPromise;
  }

  private get target(): Queryable {
    return this.als.getStore() ?? this.pool;
  }

  async query(text: string, values: unknown[] = []): Promise<pg.QueryResult> {
    await this.readyPromise;
    return this.target.query(text, values);
  }

  prepare<Row = any>(sql: string): Statement<Row> {
    return new Statement<Row>(this, sql);
  }

  // Çoxlu statement (migration/seed) — parametrsiz simple query protocol
  async exec(sql: string): Promise<void> {
    await this.readyPromise;
    await this.target.query(sql);
  }

  get inTransaction() {
    return this.als.getStore() !== undefined;
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => Promise<R> | R): TransactionFn<A, R> {
    const run = (lock: boolean) => async (...args: A): Promise<R> => {
      if (this.als.getStore()) return fn(...args); // iç-içə — eyni tranzaksiya
      await this.readyPromise;
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        if (lock) await client.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK]);
        const result = await this.als.run(client, () => fn(...args));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    };
    return Object.assign(run(false), { immediate: run(true) });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function openDb(connectionString = config.databaseUrl): DB {
  return new DB(connectionString);
}

function sqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function migrate(db: DB): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )`);
  const applied = new Set(await db.prepare('SELECT version FROM schema_migrations').pluck().all());
  const done: string[] = [];
  for (const file of sqlFiles(config.migrationsDir)) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
    await db.transaction(async () => {
      await db.exec(sql);
      await db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
    done.push(file);
  }
  // SQL Playground maskaları və grant-lar sxemə uyğunlaşdırılır (yeni sütun/cədvəl əlavə olunubsa)
  await db.exec(`DO $$ BEGIN IF to_regprocedure('lab.refresh()') IS NOT NULL THEN PERFORM lab.refresh(); END IF; END $$`);
  return done;
}

export async function userTables(db: DB): Promise<string[]> {
  return db
    .prepare(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'
       ORDER BY table_name`,
    )
    .pluck()
    .all();
}

// Bütün data silinir və seed faylları yenidən yüklənir (sxem toxunulmur). IDENTITY sayğacları da sıfırlanır.
export async function seed(db: DB): Promise<void> {
  const tables = await userTables(db);
  await db.transaction(async () => {
    if (tables.length) await db.exec(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    // MongoDB simulyasiyasının sənədləri (ayrıca sxem — 004_docstore.sql)
    await db.exec(`DO $$ BEGIN IF to_regclass('docstore.documents') IS NOT NULL THEN TRUNCATE docstore.documents; END IF; END $$`);
    for (const file of sqlFiles(config.seedDir)) await db.exec(fs.readFileSync(path.join(config.seedDir, file), 'utf8'));
    // Seed id-ləri açıq yazır — IDENTITY sequence-ləri max(id)-ə çəkilir ki, sonrakı INSERT-lər toqquşmasın
    await db.exec(`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
               WHERE c.table_schema = 'public' AND c.is_identity = 'YES' LOOP
        EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT max(%I) FROM %I), 0) + 1, false)',
                       r.table_name, r.column_name, r.column_name, r.table_name);
      END LOOP; END $$`);
  })();
}

// DB-ni tam sıfırlayır: public sxemi silinir → migration-lar → seed. (Rollar və lab sxemi migration-larda yenidən qurulur.)
export async function resetDatabase(db: DB): Promise<void> {
  await db.exec(`DROP SCHEMA IF EXISTS lab CASCADE; DROP SCHEMA IF EXISTS docstore CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO CURRENT_USER;`);
  await migrate(db);
  await seed(db);
}

export async function tableCounts(db: DB): Promise<{ table: string; rows: number }[]> {
  const out: { table: string; rows: number }[] = [];
  for (const table of await userTables(db)) {
    const row = (await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get()) as { n: number };
    out.push({ table, rows: row.n });
  }
  return out;
}
