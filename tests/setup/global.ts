// vitest globalSetup: əvvəlki qaçışlardan qalan test DB-ləri silinir, şablon (migration + seed) bir dəfə qurulur.
// Teardown: bu qaçışın worker DB-ləri silinir.
import pg from 'pg';
import { DB, resetDatabase } from '../../server/src/db.js';
import { TEMPLATE_DB, dropAllTestDatabases, urlFor } from './pg.js';

async function adminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`Testlər üçün PostgreSQL lazımdır (${(err as Error).message}). Quraşdırma: README → "PostgreSQL" (npm run db:setup).`, { cause: err });
  }
  return client;
}

const RUN_LOCK = 774411; // eyni anda iki test qaçışı bir-birinin DB-lərini silməsin

export default async function setup() {
  const lock = await adminClient();
  const { rows } = await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [RUN_LOCK]);
  if (!rows[0].ok) {
    await lock.end();
    throw new Error('Başqa test qaçışı artıq işləyir (eyni PostgreSQL). Onun bitməsini gözləyin.');
  }
  const admin = await adminClient();
  await dropAllTestDatabases(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  const db = new DB(urlFor(TEMPLATE_DB), { max: 1 });
  await resetDatabase(db);
  await db.close();
  await admin.end();

  return async function teardown() {
    const client = await adminClient();
    await dropAllTestDatabases(client);
    await client.end();
    await lock.end(); // advisory lock sessiya ilə birlikdə buraxılır
  };
}
