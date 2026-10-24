// OAuth repo — client-lər və authorization code-lar.
import type { DB } from '../../db.js';

export interface OAuthClientRow {
  client_id: string;
  client_secret_hash: string;
  name: string;
  redirect_uris: string; // JSON massiv
}

export interface OAuthCodeRow {
  code: string;
  client_id: string;
  user_id: number;
  scope: string;
  redirect_uri: string;
  expires_at: string;
  used_at: string | null;
}

export const oauthRepo = {
  findClient: async (db: DB, clientId: string) =>
    (await db.prepare(`SELECT * FROM oauth_clients WHERE client_id = ?`).get(clientId)) as OAuthClientRow | undefined,

  insertCode: (db: DB, c: Omit<OAuthCodeRow, 'used_at'> & { created_at: string }) =>
    db
      .prepare(
        `INSERT INTO oauth_codes (code, client_id, user_id, scope, redirect_uri, expires_at, created_at)
         VALUES (@code, @client_id, @user_id, @scope, @redirect_uri, @expires_at, @created_at)`,
      )
      .run(c),

  findCode: async (db: DB, code: string) =>
    (await db.prepare(`SELECT * FROM oauth_codes WHERE code = ?`).get(code)) as OAuthCodeRow | undefined,

  // "AND used_at IS NULL" — eyni anda iki sorğu gəlsə belə yalnız biri uğurlu olur.
  markCodeUsed: async (db: DB, code: string, at: string) =>
    (await db.prepare(`UPDATE oauth_codes SET used_at = ? WHERE code = ? AND used_at IS NULL`).run(at, code)).changes === 1,
};
