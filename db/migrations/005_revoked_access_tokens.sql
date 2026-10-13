-- 005_revoked_access_tokens.sql — logout access token-i də dərhal ləğv edir.
-- JWT stateless-dir: imza düzgündürsə, exp-ə qədər etibarlıdır. Logout-dan sonra oğurlanmış token işləməsin deyə
-- token-in jti-si (unikal id) bu "denylist"-ə yazılır və exp-ə qədər saxlanılır (sonra təmizlənir).
CREATE TABLE revoked_access_tokens (
  jti        TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  revoked_at TEXT    NOT NULL
);
CREATE INDEX idx_revoked_access_expires ON revoked_access_tokens(expires_at);
