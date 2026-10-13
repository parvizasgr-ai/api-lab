// Meta endpoint-lər: health, OpenAPI sənədi.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError } from '../../errors.js';

const startedAt = Date.now();

export function metaHandlers({ db, spec }: AppContext): Handlers {
  return {
    health: (_req, res) => {
      try {
        db.prepare('SELECT 1').get();
      } catch {
        throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'DB əlçatan deyil');
      }
      res.json({ status: 'ok', db: 'ok', version: String(spec.info.version), uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
    },

    getOpenApi: (_req, res) => {
      res.json(spec);
    },
  };
}
