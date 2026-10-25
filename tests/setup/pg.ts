// Testlər üçün PostgreSQL izolyasiyası.
//   * global.ts qaçışın əvvəlində şablonu (apilab_test_template) qurur: migration + seed
//   * Hər test worker-i POOL_SIZE DB istifadə edir (apilab_test_w<worker>_<i>); bazalar qaçışlar arasında qalır,
//     yalnız migration/seed dəyişəndə şablondan yenidən yaradılır
//   * createTestDb() növbəti DB-ni növbə ilə götürür və onu təmizləyir: TRUNCATE + seed (npm run db:reset ilə eyni seed kodu)
//     → eyni anda POOL_SIZE-a qədər canlı app təhlükəsizdir (testlərdə 1–3 olur)
//   * DB obyekti dərhal qaytarılır, ilk sorğu təmizliyin bitməsini gözləyir (createTestApp sinxron qalır)
import pg from 'pg';
import { DB, migrate, seed } from '../../server/src/db.js';
import { schemaFingerprint } from './fingerprint.js';

export const TEMPLATE_DB = 'apilab_test_template';
const POOL_SIZE = 4;
const BASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://apilab:apilab@localhost:5432/postgres';

export const urlFor = (database: string) => {
  const u = new URL(BASE_URL);
  u.pathname = `/${database}`;
  return u.toString();
};

let admin: pg.Pool | null = null;
const adminPool = () => (admin ??= new pg.Pool({ connectionString: BASE_URL, max: 2 }));

const names: string[] = [];
const open: DB[] = [];
let next = 0;
let created: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve(); // təmizliklər ardıcıl gedir (eyni DB-yə paralel TRUNCATE olmasın)

// Worker bazaları qaçışlar arasında SAXLANILIR (ad: worker nömrəsi, pid yox). Yalnız migration/seed dəyişəndə
// (COMMENT ON DATABASE = fingerprint) yenidən yaradılır — adi qaçışda heç bir CREATE/DROP DATABASE olmur.
const WORKER = process.env.VITEST_POOL_ID ?? '0';
const dbName = (i: number) => `apilab_test_w${WORKER}_${i}`;

function ensureDatabases(): Promise<void> {
  created ??= (async () => {
    const fingerprint = schemaFingerprint();
    for (let i = 0; i < POOL_SIZE; i++) {
      const name = dbName(i);
      const row = (await adminPool().query(`SELECT shobj_description(oid, 'pg_database') AS fp FROM pg_database WHERE datname = $1`, [name])).rows[0] as { fp: string | null } | undefined;
      if (row && row.fp !== fingerprint) await adminPool().query(`DROP DATABASE "${name}" WITH (FORCE)`);
      if (!row || row.fp !== fingerprint) {
        await adminPool().query(`CREATE DATABASE "${name}" TEMPLATE ${TEMPLATE_DB}`);
        await adminPool().query(`COMMENT ON DATABASE "${name}" IS '${fingerprint}'`);
      }
      names.push(name);
    }
  })();
  return created;
}

export function createTestDb(): DB {
  const index = next++ % POOL_SIZE;
  const ready = (queue = queue.then(async () => {
    await ensureDatabases();
    const { flushRequestLog } = await import('../../server/src/middleware/requestLog.js');
    await flushRequestLog(); // əvvəlki app-in gözləyən log yazıları yeni datanı çirkləndirməsin
    const cleaner = new DB(urlFor(names[index]), { max: 1 });
    try {
      // Testlərin müvəqqəti obyektləri (test_* trigger/funksiya) baza qaçışlar arasında qaldığı üçün silinir
      await cleaner.exec(`DO $$ DECLARE r record; BEGIN
        FOR r IN SELECT tgname, tgrelid::regclass AS tbl FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'test\\_%' LOOP
          EXECUTE format('DROP TRIGGER %I ON %s', r.tgname, r.tbl); END LOOP;
        FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname LIKE 'test\\_%' LOOP
          EXECUTE format('DROP FUNCTION %s', r.fn); END LOOP;
      END $$`);
      await migrate(cleaner); // şablon artıq migrate olunub — yeni migration yoxdursa no-op
      await seed(cleaner);
    } finally {
      await cleaner.close();
    }
  })) as Promise<void>;
  const db = new DB(urlFor(dbName(index)), { ready, max: 3, idleTimeoutMillis: 200 });
  open.push(db);
  return db;
}

// Test kodunun DB görünüşü: eyni baza, amma hər sorğudan əvvəl gözləyən request_log yazıları tamamlanır
// (app-in öz bağlantısı ayrıdır — app sorğuları flush gözləmir, dairəvi gözləmə yoxdur)
export function testView(appDb: DB): DB {
  const view = new DB(appDb.url, { ready: appDb.ready, max: 2, idleTimeoutMillis: 200 });
  const query = view.query.bind(view);
  view.query = async (text, values) => {
    const { flushRequestLog } = await import('../../server/src/middleware/requestLog.js');
    await flushRequestLog();
    return query(text, values);
  };
  open.push(view);
  return view;
}

// Fayl bitəndə: pool-lar bağlanır (DB-lər worker yaşadıqca qalır, növbəti faylda təkrar istifadə olunur)
export async function closeTestDbs(): Promise<void> {
  const list = open.splice(0);
  await queue.catch(() => undefined);
  for (const db of list) await db.close().catch(() => undefined);
  const { closePlaygroundPools } = await import('../../server/src/modules/sql/service.js');
  await closePlaygroundPools();
}

export async function closeAdmin(): Promise<void> {
  await admin?.end();
  admin = null;
}
