// Mock Google OAuth2 endpoint-ləri.
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError } from '../../errors.js';
import { writeAudit } from '../../lib/audit.js';
import { authRepo } from '../auth/repo.js';
import { renderConsentPage } from './consentPage.js';
import { DEFAULT_SCOPE, OAuthService } from './service.js';

// SPA (portal) fetch ilə işləyir: HTML/302 əvəzinə JSON istəyir (content negotiation)
const wantsJson = (req: Request) => req.accepts(['text/html', 'application/json']) === 'application/json';

export function oauthHandlers({ db, config, auth }: AppContext): Handlers {
  const oauth = new OAuthService(db, config, auth);

  const page = async (q: { client_id: string; redirect_uri: string; scope?: string; state: string }, extra: { selected?: string; error?: string } = {}) => {
    const client = await oauth.checkClient(q.client_id, q.redirect_uri);
    return renderConsentPage({
      clientId: client.client_id,
      clientName: client.name,
      redirectUri: q.redirect_uri,
      scope: q.scope || DEFAULT_SCOPE,
      state: q.state,
      users: await authRepo.listUsers(db),
      ...extra,
    });
  };

  return {
    oauthAuthorizePage: async (req, res) => {
      const q = req.valid.query as { client_id: string; redirect_uri: string; scope?: string; state: string };
      if (wantsJson(req)) {
        const client = await oauth.checkClient(q.client_id, q.redirect_uri);
        return res.json({
          client: { clientId: client.client_id, name: client.name },
          redirectUri: q.redirect_uri,
          scope: q.scope || DEFAULT_SCOPE,
          state: q.state,
          accounts: (await authRepo.listUsers(db)).map((u) => ({ username: u.username, fullName: u.full_name, email: u.email })),
        });
      }
      const html = await page(q); // əvvəl yoxlama (xəta JSON qayıtmalıdır), sonra Content-Type
      res.type('html').send(html);
    },

    oauthAuthorizeDecision: async (req, res) => {
      const form = req.valid.body;
      await oauth.checkClient(form.client_id, form.redirect_uri);
      const target = new URL(form.redirect_uri);
      target.searchParams.set('state', form.state);

      // SPA-ya 302 əvəzinə yönləndiriləcək ünvan JSON-da verilir (fetch Location başlığını oxuya bilmir)
      const redirect = () => (wantsJson(req) ? res.json({ location: target.toString() }) : res.redirect(302, target.toString()));
      if (form.decision === 'deny') {
        target.searchParams.set('error', 'access_denied');
        return redirect();
      }
      if (!(await authRepo.findUserByUsername(db, form.username))) throw new ApiError(404, 'USER_NOT_FOUND', 'İstifadəçi tapılmadı');
      const user = await auth.verifyCredentials(form.username, form.password ?? '');
      if (!user) {
        if (wantsJson(req)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Parol səhvdir');
        const html = await page(form, { selected: form.username, error: 'Parol səhvdir' });
        return res.status(401).type('html').send(html);
      }
      const scope = await oauth.grantedScopes(user.id, form.scope || DEFAULT_SCOPE);
      const code = await oauth.createCode(form.client_id, user.id, scope, form.redirect_uri);
      target.searchParams.set('code', code);
      redirect();
    },

    oauthToken: async (req, res) => {
      const form = req.valid.body;
      // Client autentifikasiyası: Authorization: Basic base64(client_id:client_secret) və ya form sahələri
      let clientId = form.client_id as string | undefined;
      let clientSecret = form.client_secret as string | undefined;
      const basic = req.get('authorization');
      if (basic?.startsWith('Basic ')) {
        const [id, ...secret] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':');
        clientId = decodeURIComponent(id);
        clientSecret = decodeURIComponent(secret.join(':'));
      }
      const { userId, response } = await oauth.exchangeCode({ clientId, clientSecret, code: form.code, redirectUri: form.redirect_uri });
      await writeAudit(db, req, config.now(), { userId, action: 'OAUTH_TOKEN_ISSUED', entity: 'oauth_clients', entityId: clientId!, details: { scope: response.scope } });
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(response);
    },

    oauthUserinfo: async (req, res) => {
      const user = await authRepo.findUserById(db, req.auth!.userId);
      if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'İstifadəçi tapılmadı');
      res.json({
        sub: String(user.id),
        name: user.full_name,
        preferred_username: user.username,
        email: user.email,
        email_verified: true,
        picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}`,
      });
    },
  };
}
