-- 03. Aylıq xərc/gəlir (GROUP BY ay + tip)
SELECT strftime('%Y-%m', created_at)        AS month,
       type,
       COUNT(*)                             AS tx_count,
       ROUND(SUM(amount_minor) / 100.0, 2)  AS total
FROM transactions
WHERE account_id = 'AZ21NABZ0001'
GROUP BY month, type
ORDER BY month, type;
