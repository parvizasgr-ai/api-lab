-- 01. Hesablarım və balanslarım (VIEW)
-- Dərs 3: GET /api/v1/accounts cavabını DB ilə müqayisə et.
SELECT account_id, owner_name, type, currency, balance, transaction_count
FROM v_account_balances
WHERE username = 'student'
ORDER BY account_id;
