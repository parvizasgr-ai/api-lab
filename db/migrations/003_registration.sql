-- 003_registration.sql — saytda qeydiyyat (ad, soyad, qrup, username, parol) və superadmin rolu.
--   * email artıq məcburi deyil (qeydiyyat formunda yoxdur); UNIQUE qalır — NULL-lar təkrarlana bilər
--   * username formatı DB səviyyəsində də yoxlanılır (API validasiyası ilə eyni qayda)
--   * SUPERADMIN — müəllim: bütün istifadəçilər, qruplar və tapşırıq nəticələri (GET /api/v1/admin/users)

ALTER TABLE users
  ADD COLUMN first_name    TEXT,
  ADD COLUMN last_name     TEXT,
  ADD COLUMN group_name    TEXT,
  ADD COLUMN last_login_at TEXT,
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN', 'SUPERADMIN'));
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$');
ALTER TABLE users ADD CONSTRAINT users_group_name_length CHECK (group_name IS NULL OR char_length(group_name) BETWEEN 2 AND 30);

CREATE INDEX idx_users_group ON users (group_name);
