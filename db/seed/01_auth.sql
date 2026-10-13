-- 01_auth.sql — demo istifadəçilər, scope-lar, API key-lər, OAuth client
-- Parollar: student/student123, admin/admin123, rauf/rauf123 (scrypt, deterministik salt — yalnız tədris üçün!)
-- Bütün vaxtlar bu günə nisbətən hesablanır: date('now', ...) → seed hər gün "təzə" görünür, amma struktur eynidir.

INSERT INTO users (id, username, password_hash, full_name, email, role, created_at, updated_at) VALUES
  (1, 'student', 'scrypt$ddc0a874ec351a5d5cbcd36d9a346b74$c47b0d6a0e288600679c9890125c744736ba2f446a0aa3daba8332e128a6e26e',
      'Aysel Məmmədova', 'student@apilab.az', 'USER',
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-400 days', '+9 hours'),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-400 days', '+9 hours')),
  (2, 'admin', 'scrypt$4c1a966c63f97e173bf7191c94efd29c$441ae9d9ec7b50589c0a6098eafb251943f2e0c5b086d4a012ff00e13e3d0663',
      'Admin Əliyev', 'admin@apilab.az', 'ADMIN',
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-500 days', '+9 hours'),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-500 days', '+9 hours')),
  (3, 'rauf', 'scrypt$6c0839eed6387db68365839fa2ae978d$68133f9462e10724f21b78c09be810dc808194714670d3434ffd59c36ba8ac50',
      'Rauf Həsənov', 'rauf@apilab.az', 'USER',
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-200 days', '+10 hours'),
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-200 days', '+10 hours'));

-- student: bütün istifadəçi scope-ları
-- rauf: cards:write YOXDUR → kartı bloklamaq istəsə 403 INSUFFICIENT_SCOPE (Authorization dərsi)
-- admin: hamısı + admin
INSERT INTO user_scopes (user_id, scope)
SELECT u.id, s.scope
FROM users u
JOIN (
  SELECT 'accounts:read' AS scope UNION ALL SELECT 'cards:read' UNION ALL SELECT 'cards:write'
  UNION ALL SELECT 'transfers:write' UNION ALL SELECT 'bookings:read' UNION ALL SELECT 'bookings:write'
  UNION ALL SELECT 'books:write' UNION ALL SELECT 'music:read' UNION ALL SELECT 'music:write'
) s
WHERE u.username IN ('student', 'admin') OR (u.username = 'rauf' AND s.scope <> 'cards:write');

INSERT INTO user_scopes (user_id, scope) VALUES (2, 'admin');

-- API key-lər (açıq mətn README-dədir, burada yalnız SHA-256 hash):
--   apilab-demo-key-2026    → aktiv (student)
--   apilab-rauf-key-2026    → aktiv (rauf)
--   apilab-revoked-key-2025 → deaktiv → 401 INVALID_API_KEY nümunəsi
INSERT INTO api_keys (id, key_hash, owner_user_id, name, active, created_at) VALUES
  (1, '7e70e10d269a1dd6dd90f1643ef025c6d44ff5a27a9ad2fc85153c5307fab56e', 1, 'Student demo key', 1,
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-30 days', '+9 hours')),
  (2, '045ec77cdcdf9b472dc62aba5d36a5575d54ebf4146d21af85f0ab599c648253', 3, 'Rauf key', 1,
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-20 days', '+9 hours')),
  (3, 'a4740b89aed85b1f8f792846b6d12ba5184e820d8984d211cba3cbb2d59c9e1e', 1, 'Köhnə (ləğv edilmiş) key', 0,
      strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-300 days', '+9 hours'));

-- Mock Google OAuth client. client_secret = apilab-portal-secret
INSERT INTO oauth_clients (client_id, client_secret_hash, name, redirect_uris) VALUES
  ('apilab-portal', '770f45dc12dc7aebce33bf2df9d7ba3f2adf5741af2015ceecfb540e8bab712c', 'API Lab Portal',
   '["http://localhost:5173/oauth/callback","http://localhost:3000/oauth/callback","http://localhost:3000/docs/oauth2-redirect.html","https://oauth.pstmn.io/v1/callback"]');
