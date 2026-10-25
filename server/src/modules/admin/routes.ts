// Admin / sistem endpoint-ləri: DB reset və sorğu tarixçəsi.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { forbidden } from '../../errors.js';
import { isAdminRole } from '../../types.js';
import { resetDatabase, tableCounts } from '../../db.js';
import { isoNow } from '../../lib/crypto.js';
import { flushRequestLog } from '../../middleware/requestLog.js';
import { applyAdminPassword, ensureSuperadmin } from '../../lib/exposure.js';
import { conflict } from '../../errors.js';
import { importSlides } from '../materials/slides.js';
import { AdminUsersService, type UserFilter } from './users.js';

// Müəllim paneli yalnız SUPERADMIN üçündür (x-required-scopes: superadmin + rol yoxlaması — iki qat)
const assertSuperadmin = (role?: string) => {
  if (role !== 'SUPERADMIN') throw forbidden('Bu panel yalnız superadmin (müəllim) üçündür');
};

export function adminHandlers({ db, config, materials }: AppContext): Handlers {
  const users = new AdminUsersService(db);
  return {
    adminListUsers: async (req, res) => {
      assertSuperadmin(req.auth?.role);
      await flushRequestLog();
      res.json(await users.list(req.valid.query as UserFilter));
    },

    adminListGroups: async (req, res) => {
      assertSuperadmin(req.auth?.role);
      await flushRequestLog();
      res.json(await users.groups());
    },

    adminGetUser: async (req, res) => {
      assertSuperadmin(req.auth?.role);
      await flushRequestLog();
      res.json(await users.detail(req.valid.params.userId));
    },

    adminResultsCsv: async (req, res) => {
      assertSuperadmin(req.auth?.role);
      const { group } = req.valid.query as { group?: string };
      const date = isoNow(config.now()).slice(0, 10);
      res
        .type('text/csv; charset=utf-8')
        .attachment(`api-lab-netice-${group ? `${group}-` : ''}${date}.csv`)
        .send(await users.resultsCsv(group));
    },

    // Bütün cədvəllər silinir → migration-lar → seed. Dərs zamanı "hər şeyi sıfırla" düyməsi.
    // Qeydiyyatdan keçmiş real tələbələr varsa — yalnız SUPERADMIN və açıq təsdiq (?confirm=all-users) ilə: hamısı silinir!
    adminReset: async (req, res) => {
      if (!isAdminRole(req.auth?.role)) throw forbidden('Bu əməliyyat yalnız ADMIN üçündür');
      const registered = (await db
        .prepare(`SELECT COUNT(*) FROM users WHERE username NOT IN ('student', 'admin', 'rauf') AND role <> 'SUPERADMIN'`)
        .pluck()
        .get()) as number;
      if (registered > 0) {
        if (req.auth?.role !== 'SUPERADMIN') throw forbidden('Qeydiyyatlı tələbələr var — sıfırlama yalnız superadmin üçündür');
        if ((req.valid.query as { confirm?: string }).confirm !== 'all-users') {
          throw conflict('RESET_WOULD_DELETE_USERS', `${registered} qeydiyyatlı tələbə və onların bütün nəticələri silinəcək. Təsdiq üçün ?confirm=all-users göndərin`, [
            { field: 'query confirm', message: 'all-users' },
          ]);
        }
      }
      materials.queue.reset();
      await resetDatabase(db);
      await applyAdminPassword(db, config); // seed admin123-ü qaytarmasın (sinif rejimi)
      await ensureSuperadmin(db, config); // müəllim hesabı sıfırlamadan sonra da qalır
      materials.storage.clear(); // köhnə material faylları — DB-də artıq yoxdur
      await importSlides(db, materials, config.materials.slidesDir);
      const tables = Object.fromEntries((await tableCounts(db)).map((c) => [c.table, c.rows]));
      res.json({ message: 'DB seed vəziyyətinə qaytarıldı', resetAt: isoNow(config.now()), tables });
    },

    // Token varsa — yalnız həmin istifadəçinin sorğuları; tokensiz — bu IP-nin anonim sorğuları; ADMIN + all=true — hamısı.
    requestHistory: async (req, res) => {
      const { limit, all } = req.valid.query as { limit: number; all: boolean };
      if (all && !isAdminRole(req.auth?.role)) throw forbidden('all=true yalnız ADMIN üçündür');
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
