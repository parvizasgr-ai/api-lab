// Auth endpoint-ləri (operationId → handler). Body artıq OpenAPI-yə görə validasiya olunub (req.valid.body).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { writeAudit } from '../../lib/audit.js';

export function authHandlers({ db, config, auth }: AppContext): Handlers {
  return {
    authLogin: async (req, res) => {
      const { username, password } = req.valid.body;
      const { user, tokens } = await auth.login(username, password);
      await writeAudit(db, req, config.now(), { userId: user.id, action: 'LOGIN', entity: 'users', entityId: user.id });
      res.locals.userId = user.id; // request_log bu sorğunu istifadəçiyə bağlasın
      res.set('Cache-Control', 'no-store').json(tokens);
    },

    authRefresh: async (req, res) => {
      res.set('Cache-Control', 'no-store').json(await auth.refresh(req.valid.body.refresh_token));
    },

    authLogout: async (req, res) => {
      await auth.logout(req.auth!, req.valid.body.refresh_token);
      res.status(204).end();
    },

    authMe: async (req, res) => {
      res.json(await auth.profile(req.auth!.userId));
    },

    authBasicDemo: (req, res) => {
      res.json({
        authScheme: 'Basic',
        username: req.auth!.username,
        message: 'Basic Auth uğurludur. Diqqət: base64 şifrələmə deyil!',
        decodedHeader: `${req.auth!.username}:********`,
      });
    },
  };
}
