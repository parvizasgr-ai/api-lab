-- 05_tasks.sql — dərs tapşırıqları. Hər tapşırıqda: endpoint, gözlənilən status və SQL Playground-da yoxlama sorğusu.
-- material_id materiallar yüklənəndə (npm run materials:seed) dərs nömrəsinə görə avtomatik bağlanır.

INSERT INTO tasks (id, lesson, title, description_md, method, path, expected_status, sql_check, sort_order, created_at, updated_at)
SELECT id, lesson, title, description_md, method, path, expected_status, sql_check, sort_order,
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-7 days', '+9 hours'),
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '-7 days', '+9 hours')
FROM (
  -- ---------------------------------------------------------------- Dərs 1: API əsasları
  SELECT 1 AS id, 1 AS lesson, 'Valyuta məzənnələrini al' AS title,
         'İlk GET sorğusu. `X-API-Key: apilab-demo-key-2026` başlığını əlavə edin. Cavabda **status line**, **headers** (Content-Type, X-Request-Id, X-RateLimit-Remaining) və **body**-ni tapın.' AS description_md,
         'GET' AS method, '/api/v1/currencies/rates?base=AZN' AS path, 200 AS expected_status,
         'SELECT quote, rate, rate_date FROM exchange_rates WHERE rate_date = (SELECT MAX(rate_date) FROM exchange_rates) ORDER BY quote' AS sql_check,
         1 AS sort_order
  UNION ALL SELECT 2, 1, 'API Key olmadan sorğu',
         'Eyni sorğunu `X-API-Key` başlığı olmadan göndərin. Status kodu nədir? `code` sahəsi nə deyir? Bu sorğu request_log-a yazıldımı?',
         'GET', '/api/v1/currencies', 401,
         'SELECT method, path, status, created_at FROM request_log WHERE path = ''/api/v1/currencies'' ORDER BY id DESC LIMIT 5', 2
  UNION ALL SELECT 3, 1, 'Valyuta çevir: 100 USD → AZN',
         'Query parametrləri ilə işləyin: `from`, `to`, `amount`. Sonra `amount=abc` göndərin — nə dəyişir?',
         'GET', '/api/v1/currencies/convert?from=USD&to=AZN&amount=100', 200,
         'SELECT quote, rate, ROUND(1.0 / rate, 4) AS azn_per_unit FROM exchange_rates WHERE quote = ''USD'' ORDER BY rate_date DESC LIMIT 1', 3
  UNION ALL SELECT 4, 1, 'Request-in izi: X-Request-Id',
         'Cavab başlığındakı `X-Request-Id`-ni kopyalayın və SQL ilə həmin sorğunu request_log-da tapın (sorğudakı dəyəri dəyişin).',
         'GET', '/api/v1/health', 200,
         'SELECT request_id, method, path, status, duration_ms FROM request_log ORDER BY id DESC LIMIT 10', 4

  -- ---------------------------------------------------------------- Dərs 2: HTTP və REST
  UNION ALL SELECT 5, 2, 'Yeni müştəri yarat (201 + Location)',
         'Body: `{"firstName":"Rəna","lastName":"Quliyeva","email":"rena@example.az"}`. Cavabda `Location` başlığını tapın və o ünvana GET göndərin.',
         'POST', '/api/v1/customers', 201,
         'SELECT id, first_name, last_name, email, created_at FROM customers ORDER BY id DESC LIMIT 1', 1
  UNION ALL SELECT 6, 2, 'Eyni email ikinci dəfə (409)',
         'Əvvəlki sorğunu təkrar göndərin. POST idempotent deyil — niyə 409 aldıq? Bu qaydanı kim qoruyur: API, yoxsa DB (UNIQUE)?',
         'POST', '/api/v1/customers', 409,
         'SELECT email, COUNT(*) AS n FROM customers GROUP BY email HAVING COUNT(*) > 1', 2
  UNION ALL SELECT 7, 2, 'ETag və 304 Not Modified',
         'GET cavabındakı `ETag`-i `If-None-Match` başlığında göndərin. Gövdə gəldimi? Sonra PATCH edib yenidən yoxlayın.',
         'GET', '/api/v1/customers/1', 304,
         'SELECT id, city, updated_at FROM customers WHERE id = 1', 3
  UNION ALL SELECT 8, 2, 'PUT və PATCH fərqi',
         'Əvvəl `PATCH {"city":"Quba"}` göndərin, sonra eyni body ilə `PUT` — PUT niyə 422 qaytarır?',
         'PATCH', '/api/v1/customers/1', 200,
         'SELECT first_name, last_name, phone, city, active, updated_at FROM customers WHERE id = 1', 4
  UNION ALL SELECT 9, 2, 'Sil (204) və yenidən sil (404)',
         'DELETE iki dəfə göndərin. DELETE idempotentdirmi, əgər ikinci cavab fərqlidirsə?',
         'DELETE', '/api/v1/customers/25', 204,
         'SELECT COUNT(*) AS total, MAX(id) AS last_id FROM customers', 5

  -- ---------------------------------------------------------------- Dərs 3: Security, Design, API Specification
  UNION ALL SELECT 10, 3, 'Login → Bearer token',
         '`student/student123` ilə login olun. `access_token`-i jwt.io-da açın: `sub`, `scope`, `exp` nədir? Refresh token DB-də necə saxlanılır?',
         'POST', '/api/v1/auth/login', 200,
         'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens ORDER BY id DESC LIMIT 3', 1
  UNION ALL SELECT 11, 3, '401: token yoxdur',
         'Kartları token olmadan istəyin. `WWW-Authenticate` başlığına baxın.',
         'GET', '/api/v1/cards', 401,
         'SELECT method, path, status, user_id FROM request_log WHERE status = 401 ORDER BY id DESC LIMIT 5', 2
  UNION ALL SELECT 12, 3, '403: başqasının kartı (BOLA)',
         'student kimi rauf-un kartını (id=5) bloklamağa çalışın. Sonra rauf kimi login olub öz kartını bloklayın — niyə yenə 403 (scope)?',
         'POST', '/api/v1/cards/5/block', 403,
         'SELECT c.id, u.username AS owner, c.status FROM cards c JOIN users u ON u.id = c.owner_id ORDER BY c.id', 3
  UNION ALL SELECT 13, 3, 'Kartı blokla + Idempotency-Key (iki dəfə)',
         'Eyni `Idempotency-Key` ilə 2 dəfə göndərin: ikinci cavab 200 + `Idempotent-Replayed: true`. Açarsız ikinci cəhd isə 409 verir.',
         'POST', '/api/v1/cards/1/block', 200,
         'SELECT h.card_id, h.old_status, h.new_status, h.reason, h.changed_at, (SELECT COUNT(*) FROM idempotency_keys) AS idempotency_rows FROM card_status_history h WHERE h.card_id = 1', 4
  UNION ALL SELECT 14, 3, 'Rate limit: 429 yaradın',
         'Postman Runner ilə eyni sorğunu 61 dəfə göndərin. `Retry-After` və `X-RateLimit-Remaining` başlıqlarına baxın.',
         'GET', '/api/v1/airports', 429,
         'SELECT subject, window_start, count FROM rate_limit_counters ORDER BY window_start DESC, count DESC LIMIT 10', 5
  UNION ALL SELECT 15, 3, 'OAuth2 Authorization Code flow',
         'Brauzerdə `/oauth/authorize?response_type=code&client_id=apilab-portal&redirect_uri=https://oauth.pstmn.io/v1/callback&state=dars3-oauth` açın, code-u `/oauth/token`-də dəyişin. Eyni code ilə ikinci cəhd nə qaytarır?',
         'GET', '/oauth/authorize', 200,
         'SELECT client_id, user_id, scope, expires_at, used_at FROM oauth_codes ORDER BY created_at DESC LIMIT 5', 6
  UNION ALL SELECT 16, 3, 'JSON Schema xətası (422)',
         'Kartı `{"reason":"BROKEN","urgent":true}` ilə bloklayın. `details[]`-də neçə xəta var? Hər birini OpenAPI sxemi ilə müqayisə edin.',
         'POST', '/api/v1/cards/2/block', 422,
         'SELECT method, route, status, created_at FROM request_log WHERE status = 422 ORDER BY id DESC LIMIT 5', 7
) t
ORDER BY id;
