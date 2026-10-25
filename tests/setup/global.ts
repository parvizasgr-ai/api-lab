// vitest globalSetup: şablon baza (migration + seed) yalnız migration/seed faylları dəyişəndə yenidən qurulur.
// Test bazaları qaçışlar arasında saxlanılır (tests/setup/pg.ts) — adi qaçışda CREATE/DROP DATABASE olmur.
import pg from 'pg';
import { DB, resetDatabase } from '../../server/src/db.js';
import { schemaFingerprint } from './fingerprint.js';
import { TEMPLATE_DB, urlFor } from './pg.js';

async function adminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Testlər üçün PostgreSQL lazımdır (${(err as Error).message}). Quraşdırma: README → "PostgreSQL" (npm run db:setup).`, { cause: err });
  }
  return client;
}

const RUN_LOCK = 774411; // eyni anda iki test qaçışı eyni bazalarla işləməsin

export default async function setup() {
  const lock = await adminClient();
  const { rows } = await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [RUN_LOCK]);
  if (!rows[0].ok) {
    await lock.end();
    throw new Error('Başqa test qaçışı artıq işləyir (eyni PostgreSQL). Onun bitməsini gözləyin.');
  }
  const fingerprint = schemaFingerprint();
  const current = (await lock.query(`SELECT shobj_description(oid, 'pg_database') AS fp FROM pg_database WHERE datname = $1`, [TEMPLATE_DB])).rows[0] as { fp: string | null } | undefined;
  if (current?.fp !== fingerprint) {
    if (current) await lock.query(`DROP DATABASE ${TEMPLATE_DB} WITH (FORCE)`);
    await lock.query(`CREATE DATABASE ${TEMPLATE_DB}`);
    const db = new DB(urlFor(TEMPLATE_DB), { max: 1 });
    await resetDatabase(db);
    await db.close();
    await lock.query(`COMMENT ON DATABASE ${TEMPLATE_DB} IS '${fingerprint}'`);
  }
  return async function teardown() {
    await lock.end(); // advisory lock sessiya ilə birlikdə buraxılır
  };
}
