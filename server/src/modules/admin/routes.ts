// Admin / sistem endpoint-ləri: DB reset və sorğu tarixçəsi.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { forbidden } from '../../errors.js';
import { resetDatabase, tableCounts } from '../../db.js';
import { isoNow } from '../../lib/crypto.js';
import { flushRequestLog } from '../../middleware/requestLog.js';
import { applyAdminPassword } from '../../lib/exposure.js';
import { importSlides } from '../materials/slides.js';

export function adminHandlers({ db, config, materials }: AppContext): Handlers {
  return {
    // Bütün cədvəllər silinir → migration-lar → seed. Dərs zamanı "hər şeyi sıfırla" düyməsi.
    adminReset: async (req, res) => {
      if (req.auth?.role !== 'ADMIN') throw forbidden('Bu əməliyyat yalnız ADMIN üçündür');
      materials.queue.reset();
      await resetDatabase(db);
      await applyAdminPassword(db, config); // seed admin123-ü qaytarmasın (sinif rejimi)
      materials.storage.clear(); // köhnə material faylları — DB-də artıq yoxdur
      await importSlides(db, materials, config.materials.slidesDir);
      const tables = Object.fromEntries((await tableCounts(db)).map((c) => [c.table, c.rows]));
      res.json({ message: 'DB seed vəziyyətinə qaytarıldı', resetAt: isoNow(config.now()), tables });
    },

    // Token varsa — yalnız həmin istifadəçinin sorğuları; tokensiz — bu IP-nin anonim sorğuları; ADMIN + all=true — hamısı.
    requestHistory: async (req, res) => {
      const { limit, all } = req.valid.query as { limit: number; all: boolean };
      if (all && req.auth?.role !== 'ADMIN') throw forbidden('all=true yalnız ADMIN üçündür');
      await flushRequestLog(); // tələbə öz son sorğusunu tarixçədə görsün (log yazısı asinxrondur)
      const where = all ? '1 = 1' : req.auth ? 'user_id = @userId' : 'user_id IS NULL AND ip = @ip';
      const items = await db
              .prepare(
                `SELECT id, request_id AS "requestId", method, path, route, status, duration_ms AS "durationMs", created_at AS "createdAt"
           FROM request_log WHERE ${where} ORDER BY id DESC LIMIT @limit`,
              )
              .all({ userId: req.auth?.userId ?? null, ip: req.ip ?? null, limit });
      res.json({ items });
    },
  };
}
