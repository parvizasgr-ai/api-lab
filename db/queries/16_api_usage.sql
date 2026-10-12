-- 16. API istifadəsi (VIEW, request_log əsasında) — hansı endpoint ən çox xəta verir?
SELECT method, endpoint, calls, avg_ms, client_errors, server_errors, last_called_at
FROM v_api_usage_by_endpoint
ORDER BY calls DESC
LIMIT 20;
