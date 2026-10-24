// Testlər üçün PostgreSQL izolyasiyası.
//   * global.ts qaçışın əvvəlində şablonu (apilab_test_template) qurur: migration + seed
//   * Hər test worker-i ilk ehtiyacda POOL_SIZE DB alır (CREATE DATABASE … TEMPLATE) — bütün qaçış üçün cəmi onlarla DB
//   * createTestDb() növbəti DB-ni növbə ilə götürür və onu təmizləyir: TRUNCATE + seed (npm run db:reset ilə eyni seed kodu)
//     → eyni anda POOL_SIZE-a qədər canlı app təhlükəsizdir (testlərdə 1–3 olur)
//   * DB obyekti dərhal qaytarılır, ilk sorğu təmizliyin bitməsini gözləyir (createTestApp sinxron qalır)
import pg from 'pg';
import { DB, migrate, seed } from '../../server/src/db.js';

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

function ensureDatabases(): Promise<void> {
  created ??= (async () => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const name = `apilab_test_${process.pid}_${i}`;
      // Vitest hər test faylını təcrid olunmuş modulda işlədir — bu worker-in DB-ləri əvvəlki fayldan qalıbsa, təkrar istifadə
      // (hər app onsuz da TRUNCATE + seed ilə təmizlənir). DROP/CREATE bahalıdır və paralel worker-lərdə bir-birini gözləyir.
      const exists = (await adminPool().query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount;
      if (!exists) await adminPool().query(`CREATE DATABASE "${name}" TEMPLATE ${TEMPLATE_DB}`);
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
      await migrate(cleaner); // şablon artıq migrate olunub — yeni migration yoxdursa no-op
      await seed(cleaner);
    } finally {
      await cleaner.close();
    }
  })) as Promise<void>;
  const db = new DB(urlFor(`apilab_test_${process.pid}_${index}`), { ready, max: 3, idleTimeoutMillis: 200 });
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

// globalTeardown/globalSetup: bu qaçışın (və köhnə qaçışların) test DB-lərini silir
export async function dropAllTestDatabases(client: pg.Client): Promise<void> {
  const rows = (await client.query(`SELECT datname FROM pg_database WHERE datname LIKE 'apilab\\_test\\_%'`)).rows as { datname: string }[];
  for (const { datname } of rows) {
    // Bağlantılar bağlanarkən (məs. autovacuum) FORCE icazə xətası verə bilər — qısa gözləyib təkrar; alınmasa növbəti qaçış silir
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
}
