-- 17. Idempotency və Rate limit izləri
-- Eyni Idempotency-Key ilə 2 sorğu → idempotency_keys-də 1 sətir, transfers-də 1 yeni sətir olmalıdır.
SELECT key, endpoint, response_status, created_at, expires_at FROM idempotency_keys ORDER BY created_at DESC;

-- 61-ci sorğudan sonra count = 61+ olacaq və API 429 qaytaracaq.
SELECT subject, window_start, count FROM rate_limit_counters ORDER BY window_start DESC, count DESC;
