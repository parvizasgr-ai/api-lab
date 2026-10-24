// Auth repo — yalnız SQL (prepared statements).
import type { DB } from '../../db.js';
import type { Role } from '../../types.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  group_name: string | null;
  email: string | null;
  role: Role;
  last_login_at: string | null;
}

export interface RefreshTokenRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  scope: string | null; // NULL — parol ilə login (istifadəçinin cari scope-ları); OAuth — verilmiş scope
}

export interface ApiKeyRow {
  id: number;
  owner_user_id: number;
  username: string;
  role: Role;
}

export const authRepo = {
  findUserByUsername: async (db: DB, username: string) =>
    (await db.prepare(`SELECT * FROM users WHERE username = ?`).get(username)) as UserRow | undefined,

  findUserById: async (db: DB, id: number) => (await db.prepare(`SELECT * FROM users WHERE id = ?`).get(id)) as UserRow | undefined,

  // Mock Google hesab seçimi yalnız seed demo hesablarını göstərir — qeydiyyatdan keçən tələbələr heç vaxt siyahılanmır
  listDemoUsers: async (db: DB) =>
    (await db.prepare(`SELECT id, username, full_name, email, role FROM users WHERE username IN ('student', 'admin', 'rauf') ORDER BY id`).all()) as Pick<UserRow, 'id' | 'username' | 'full_name' | 'email' | 'role'>[],

  listUsers: async (db: DB) =>
    (await db.prepare(`SELECT id, username, full_name, email, role FROM users ORDER BY id`).all()) as Omit<UserRow, 'password_hash'>[],

  scopesOf: async (db: DB, userId: number) =>
    (await db.prepare(`SELECT scope FROM user_scopes WHERE user_id = ? ORDER BY scope`).pluck().all(userId)) as string[],

  insertRefreshToken: (db: DB, userId: number, tokenHash: string, expiresAt: string, createdAt: string, scope: string | null = null) =>
    db
      .prepare(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at, scope) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, tokenHash, expiresAt, createdAt, scope),

  findRefreshToken: async (db: DB, tokenHash: string) =>
    (await db.prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`).get(tokenHash)) as RefreshTokenRow | undefined,

  revokeRefreshToken: (db: DB, id: number, at: string) =>
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).run(at, id),

  revokeAllRefreshTokens: (db: DB, userId: number, at: string) =>
    db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(at, userId),

  findActiveApiKey: async (db: DB, keyHash: string) =>
    (await db
            .prepare(
              `SELECT k.id, k.owner_user_id, u.username, u.role
         FROM api_keys k JOIN users u ON u.id = k.owner_user_id
         WHERE k.key_hash = ? AND k.active = 1`,
            )
            .get(keyHash)) as ApiKeyRow | undefined,

  // ---- logout edilmiş access token-lər (jti denylist)
  isAccessTokenRevoked: async (db: DB, jti: string) => await db.prepare(`SELECT 1 FROM revoked_access_tokens WHERE jti = ?`).get(jti) !== undefined,

  revokeAccessToken: async (db: DB, jti: string, userId: number, expiresAt: string, at: string) => {
    await db.prepare(`DELETE FROM revoked_access_tokens WHERE expires_at < ?`).run(at); // vaxtı keçmişlər artıq lazım deyil
    await db.prepare(`INSERT INTO revoked_access_tokens (jti, user_id, expires_at, revoked_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(jti, userId, expiresAt, at);
  },

  // ---- login uğursuzluqları (rate_limit_counters-də, fixed window)
  loginFailures: async (db: DB, subject: string, windowStart: string) =>
    ((await db.prepare(`SELECT count FROM rate_limit_counters WHERE subject = ? AND window_start = ?`).pluck().get(subject, windowStart)) as number | undefined) ?? 0,

  recordLoginFailure: (db: DB, subject: string, windowStart: string) =>
    db
      .prepare(
        `INSERT INTO rate_limit_counters (subject, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (subject, window_start) DO UPDATE SET count = rate_limit_counters.count + 1`,
      )
      .run(subject, windowStart),

  touchLogin: (db: DB, userId: number, at: string) => db.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(at, userId),

  clearLoginFailures: (db: DB, subject: string) => db.prepare(`DELETE FROM rate_limit_counters WHERE subject = ?`).run(subject),
};
