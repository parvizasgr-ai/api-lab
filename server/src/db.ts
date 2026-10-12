// DB qatı: raw SQL + prepared statements (ORM yoxdur — tələbələr SQL-i birbaşa görsün).
// Migration = db/migrations/*.sql faylları ardıcıl icra olunur, hansıların tətbiq olunduğu schema_migrations-da saxlanır.
// Seed = db/seed/*.sql faylları. Tarixlər SQL-də date('now', ...) ilə bu günə nisbətən hesablanır.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

export type DB = Database.Database;

export function openDb(file = config.dbPath, options: { readonly?: boolean } = {}): DB {
  if (file !== ':memory:' && !options.readonly) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { readonly: options.readonly ?? false, fileMustExist: options.readonly ?? false });
  if (!options.readonly) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // SQLite-da FOREIGN KEY yoxlaması default olaraq söndürülüb
  db.pragma('busy_timeout = 5000');
  return db;
}

function sqlFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function migrate(db: DB): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[],
  );
  const done: string[] = [];
  for (const file of sqlFiles(config.migrationsDir)) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
    done.push(file);
  }
  return done;
}

export function userTables(db: DB): string[] {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'
       ORDER BY name`,
    )
    .pluck()
    .all() as string[];
}

// Bütün data silinir və seed faylları yenidən yüklənir (sxem toxunulmur).
export function seed(db: DB): void {
  db.pragma('foreign_keys = OFF'); // transaction daxilində dəyişdirmək olmur, ona görə əvvəl
  try {
    db.transaction(() => {
      for (const t of userTables(db)) db.exec(`DELETE FROM "${t}"`);
      const hasSeq = db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'`).get();
      if (hasSeq) db.exec('DELETE FROM sqlite_sequence');
      for (const file of sqlFiles(config.seedDir)) {
        db.exec(fs.readFileSync(path.join(config.seedDir, file), 'utf8'));
      }
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length) throw new Error(`Seed FK pozuntusu: ${JSON.stringify(violations)}`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// DB-ni tam sıfırlayır: bütün obyektlər silinir → migration-lar → seed.
export function resetDatabase(db: DB): void {
  db.pragma('foreign_keys = OFF');
  try {
    const objects = db
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' AND type IN ('view','trigger','table')
         ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1 ELSE 2 END`,
      )
      .all() as { type: string; name: string }[];
    db.transaction(() => {
      for (const o of objects) db.exec(`DROP ${o.type.toUpperCase()} IF EXISTS "${o.name}"`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  migrate(db);
  seed(db);
}

export function tableCounts(db: DB): { table: string; rows: number }[] {
  return userTables(db).map((table) => ({
    table,
    rows: (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n,
  }));
}

// db/schema.sql — cari tam sxemin "snapshot"-u (tələbələr bir faylda bütün DDL-i görsün).
export function dumpSchema(db: DB): string {
  const rows = db
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name`,
    )
    .pluck()
    .all() as string[];
  return (
    '-- AUTO-GENERATED: `npm run db:reset` tərəfindən yaradılır. Dəyişiklik üçün db/migrations/ istifadə edin.\n\n' +
    rows.map((s) => s.trim() + ';').join('\n\n') +
    '\n'
  );
}
