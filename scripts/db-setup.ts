// npm run db:setup — PostgreSQL-i API Lab üçün hazırlayır (təkrar işlətmək təhlükəsizdir):
//   * rollar: apilab (tətbiq, DB sahibi, CREATEDB — testlər üçün), apilab_playground (SQL Playground, yalnız oxu)
//   * bazalar: DATABASE_URL-dəki (default apilab) və apilab_e2e (Playwright testləri)
//   * əsas baza boşdursa: migration + seed
// Superuser bağlantısı: PG_SUPERUSER_URL (default — macOS istifadəçisi, Homebrew quraşdırmasında parolsuz localhost).
import os from 'node:os';
import pg from 'pg';
import { config } from '../server/src/config.js';
import { DB, migrate, resetDatabase, userTables } from '../server/src/db.js';

const superUrl = process.env.PG_SUPERUSER_URL ?? `postgres://${os.userInfo().username}@localhost:5432/postgres`;
const app = new URL(config.databaseUrl);
const appUser = decodeURIComponent(app.username);
const appPassword = decodeURIComponent(app.password);
const mainDb = app.pathname.slice(1);
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

const su = new pg.Client({ connectionString: superUrl });
try {
  await su.connect();
} catch (err) {
  console.error(`Superuser kimi qoşulmaq olmadı (${superUrl}): ${(err as Error).message}`);
  console.error('PostgreSQL işləyirmi? brew services start postgresql@16  — və ya PG_SUPERUSER_URL verin.');
  process.exit(1);
}

async function ensureRole(name: string, password: string, extra: string) {
  const exists = (await su.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name])).rowCount;
  await su.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${ident(name)} WITH LOGIN PASSWORD ${literal(password)} ${extra}`);
  console.log(`  ✓ rol ${name}${exists ? ' (yeniləndi)' : ' (yaradıldı)'}`);
}

async function ensureDatabase(name: string) {
  const exists = (await su.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount;
  if (!exists) await su.query(`CREATE DATABASE ${ident(name)} OWNER ${ident(appUser)}`);
  await su.query(`ALTER DATABASE ${ident(name)} SET timezone TO 'UTC'`);
  console.log(`  ✓ baza ${name}${exists ? '' : ' (yaradıldı)'}`);
}

console.log(`PostgreSQL: ${superUrl.replace(/:[^:@/]*@/, ':***@')}`);
await ensureRole(appUser, appPassword, 'CREATEDB NOSUPERUSER NOCREATEROLE');
await ensureRole('apilab_playground', config.playgroundPassword, 'NOSUPERUSER NOCREATEDB NOCREATEROLE');
await su.query(`GRANT apilab_playground TO ${ident(appUser)}`); // tətbiq playground bağlantılarını idarə edə bilsin
await ensureDatabase(mainDb);
await ensureDatabase('apilab_e2e');
await su.end();

const db = new DB(config.databaseUrl);
if ((await userTables(db)).length === 0) {
  await resetDatabase(db);
  console.log(`  ✓ ${mainDb}: migration + seed`);
} else {
  const applied = await migrate(db);
  console.log(`  ✓ ${mainDb}: ${applied.length ? `yeni migration-lar: ${applied.join(', ')}` : 'aktualdır'}`);
}
await db.close();
console.log('\nHazırdır: npm start');
