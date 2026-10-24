// SQL Playground endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { SqlPlaygroundService } from './service.js';

export function sqlHandlers(ctx: AppContext): Handlers {
  const sql = new SqlPlaygroundService(ctx);
  return {
    dbSchema: async (_req, res) => res.json(await sql.schema()),
    dbQuery: async (req, res) => res.json(await sql.query(req, req.valid.body.sql)),
  };
}
