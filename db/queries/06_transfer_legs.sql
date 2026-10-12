-- 06. Köçürmə və onun 2 "ayağı" (DEBIT + CREDIT) — atomiklik yoxlaması
-- Dərs 3: POST /api/v1/transfers-dən sonra işlət. Hər transfer üçün tam 2 əməliyyat olmalıdır.
SELECT tr.id AS transfer_id, tr.from_account, tr.to_account,
       ROUND(tr.amount_minor / 100.0, 2) AS amount, tr.currency, tr.status,
       COUNT(t.id) AS legs,
       GROUP_CONCAT(t.type || ':' || t.account_id, ' | ') AS details
FROM transfers tr
LEFT JOIN transactions t ON t.transfer_id = tr.id
GROUP BY tr.id
ORDER BY tr.id DESC;
