// Mock OAuth2 Authorization Server — Authorization Code flow (RFC 6749 §4.1).
//   1. GET  /oauth/authorize → consent səhifəsi
//   2. POST /oauth/authorize → code yaradılır, brauzer redirect_uri?code=...&state=... ünvanına yönləndirilir
//   3. POST /oauth/token     → client (back channel) code-u access token-ə dəyişir
// Qaydalar: redirect_uri qeydiyyatda olmalıdır, code birdəfəlikdir və 60 saniyə yaşayır.
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { ApiError, OAuthError } from '../../errors.js';
import { isoAfter, isoNow, randomToken, sha256 } from '../../lib/crypto.js';
import type { AuthService } from '../auth/service.js';
import { authRepo } from '../auth/repo.js';
import { oauthRepo, type OAuthClientRow } from './repo.js';

export const OIDC_SCOPES = ['openid', 'profile', 'email'];
export const DEFAULT_SCOPE = 'openid profile email';

export class OAuthService {
  constructor(
    private db: DB,
    private config: Config,
    private auth: AuthService,
  ) {}

  // Açıq redirect (open redirect) hücumunun qarşısı: yalnız qeydiyyatlı redirect_uri-yə yönləndiririk.
  async checkClient(clientId: string, redirectUri: string): Promise<OAuthClientRow> {
    const client = await oauthRepo.findClient(this.db, clientId);
    if (!client) throw new ApiError(400, 'BAD_REQUEST', `Naməlum client_id: ${clientId}`);
    if (!this.redirectUris(client).includes(redirectUri)) {
      throw new ApiError(400, 'INVALID_REDIRECT_URI', 'redirect_uri bu client üçün qeydiyyatda deyil');
    }
    return client;
  }

  // Qeydiyyatlı URI-lər + portalın öz client-i üçün PUBLIC_URL-in callback-ləri (sinifdə portal LAN IP-dən açılanda)
  private redirectUris(client: OAuthClientRow): string[] {
    const registered = JSON.parse(client.redirect_uris) as string[];
    if (client.client_id !== 'apilab-portal') return registered;
    const origin = new URL(this.config.publicUrl).origin;
    return [...registered, `${origin}/oauth/callback`, `${origin}/docs/oauth2-redirect.html`];
  }

  // İstənən scope-lardan yalnız icazəli olanlar: OIDC + istifadəçinin öz scope-ları. "admin" heç vaxt.
  async grantedScopes(userId: number, requested: string): Promise<string> {
    const allowed = new Set([...OIDC_SCOPES, ...(await authRepo.scopesOf(this.db, userId)).filter((s) => s !== 'admin')]);
    return requested.split(' ').filter((s) => allowed.has(s)).join(' ');
  }

  async createCode(clientId: string, userId: number, scope: string, redirectUri: string): Promise<string> {
    const now = this.config.now();
    const code = randomToken('ac', 16);
    await oauthRepo.insertCode(this.db, {
            code,
            client_id: clientId,
            user_id: userId,
            scope,
            redirect_uri: redirectUri,
            expires_at: isoAfter(now, this.config.oauthCodeTtlSec),
            created_at: isoNow(now),
          });
    return code;
  }

  async exchangeCode(input: { clientId?: string; clientSecret?: string; code: string; redirectUri: string }) {
    if (!input.clientId || !input.clientSecret) {
      throw new OAuthError(401, 'invalid_client', 'Client autentifikasiyası tələb olunur (Basic və ya client_id + client_secret)');
    }
    const client = await oauthRepo.findClient(this.db, input.clientId);
    if (!client || client.client_secret_hash !== sha256(input.clientSecret)) {
      throw new OAuthError(401, 'invalid_client', 'client_id və ya client_secret səhvdir');
    }
    const row = await oauthRepo.findCode(this.db, input.code);
    if (!row || row.client_id !== client.client_id) {
      throw new OAuthError(400, 'invalid_grant', 'Authorization code etibarsızdır');
    }
    if (row.used_at) throw new OAuthError(400, 'invalid_grant', 'Authorization code artıq istifadə olunub');
    const now = this.config.now();
    if (row.expires_at <= isoNow(now)) throw new OAuthError(400, 'invalid_grant', 'Authorization code-un vaxtı keçib');
    if (row.redirect_uri !== input.redirectUri) {
      throw new OAuthError(400, 'invalid_grant', 'redirect_uri authorize addımındakı ilə eyni deyil');
    }
    if (!(await oauthRepo.markCodeUsed(this.db, row.code, isoNow(now)))) {
      throw new OAuthError(400, 'invalid_grant', 'Authorization code artıq istifadə olunub');
    }
    const user = (await authRepo.findUserById(this.db, row.user_id))!;
    // Refresh token da verilir — scope-u kodun scope-u ilə məhdudlaşır (refresh-də genişlənmir)
    const pair = await this.auth.issueTokenPair(user, row.scope);
    return {
      userId: user.id,
      response: {
        access_token: pair.access_token,
        token_type: 'Bearer' as const,
        expires_in: pair.expires_in,
        refresh_token: pair.refresh_token,
        scope: row.scope,
      },
    };
  }
}
