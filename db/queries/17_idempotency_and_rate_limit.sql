-- 17. Idempotency və Rate limit izləri
-- Eyni Idempotency-Key ilə 2 sorğu → idempotency_keys-də 1 sətir, transfers-də 1 yeni sətir olmalıdır.
SELECT key, endpoint, response_status, created_at, expires_at FROM idempotency_keys ORDER BY created_at DESC;

-- Rate limit sayğacları Redis-dədir (Infra → Redis: ratelimit:*). DB-də 429-ların izi request_log-dadır:
SELECT path, status, COUNT(*) AS sorgu FROM request_log WHERE status = 429 GROUP BY path, status ORDER BY sorgu DESC;

-- Login brute-force kilidi isə DB-dədir: eyni username üçün uğursuz cəhdlər (subject = 'login-fail:<username>')
SELECT subject, window_start, count FROM rate_limit_counters ORDER BY window_start DESC, count DESC;
