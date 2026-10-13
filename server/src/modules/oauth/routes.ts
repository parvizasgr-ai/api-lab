// Mock Google OAuth2 endpoint-ləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError } from '../../errors.js';
import { writeAudit } from '../../lib/audit.js';
import { authRepo } from '../auth/repo.js';
import { renderConsentPage } from './consentPage.js';
import { DEFAULT_SCOPE, OAuthService } from './service.js';

export function oauthHandlers({ db, config, auth }: AppContext): Handlers {
  const oauth = new OAuthService(db, config, auth);

  const page = (q: { client_id: string; redirect_uri: string; scope?: string; state: string }, extra: { selected?: string; error?: string } = {}) => {
    const client = oauth.checkClient(q.client_id, q.redirect_uri);
    return renderConsentPage({
      clientId: client.client_id,
      clientName: client.name,
      redirectUri: q.redirect_uri,
      scope: q.scope || DEFAULT_SCOPE,
      state: q.state,
      users: authRepo.listUsers(db),
      ...extra,
    });
  };

  return {
    oauthAuthorizePage: (req, res) => {
      const html = page(req.valid.query as any); // əvvəl yoxlama (xəta JSON qayıtmalıdır), sonra Content-Type
      res.type('html').send(html);
    },

    oauthAuthorizeDecision: (req, res) => {
      const form = req.valid.body;
      oauth.checkClient(form.client_id, form.redirect_uri);
      const target = new URL(form.redirect_uri);
      target.searchParams.set('state', form.state);

      if (form.decision === 'deny') {
        target.searchParams.set('error', 'access_denied');
        return res.redirect(302, target.toString());
      }
      if (!authRepo.findUserByUsername(db, form.username)) throw new ApiError(404, 'USER_NOT_FOUND', 'İstifadəçi tapılmadı');
      const user = auth.verifyCredentials(form.username, form.password ?? '');
      if (!user) {
        const html = page(form, { selected: form.username, error: 'Parol səhvdir' });
        return res.status(401).type('html').send(html);
      }
      const scope = oauth.grantedScopes(user.id, form.scope || DEFAULT_SCOPE);
      const code = oauth.createCode(form.client_id, user.id, scope, form.redirect_uri);
      target.searchParams.set('code', code);
      res.redirect(302, target.toString());
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
      writeAudit(db, req, config.now(), { userId, action: 'OAUTH_TOKEN_ISSUED', entity: 'oauth_clients', entityId: clientId!, details: { scope: response.scope } });
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(response);
    },

    oauthUserinfo: (req, res) => {
      const user = authRepo.findUserById(db, req.auth!.userId);
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
