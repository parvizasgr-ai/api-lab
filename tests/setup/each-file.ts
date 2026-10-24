// Hər test faylından sonra: pool-lar bağlanır (worker DB-ləri növbəti fayllar üçün qalır, qaçışın sonunda silinir).
import { afterAll } from 'vitest';
import { closeAdmin, closeTestDbs } from './pg.js';

afterAll(async () => {
  await closeTestDbs();
  await closeAdmin();
});
