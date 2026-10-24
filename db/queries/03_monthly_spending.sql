-- 03. Aylıq xərc/gəlir (GROUP BY ay + tip)
SELECT substr(created_at, 1, 7)             AS month,
       type,
       COUNT(*)                             AS tx_count,
       ROUND(SUM(amount_minor) / 100.0, 2)  AS total
FROM transactions
WHERE account_id = 'AZ21NABZ0001'
GROUP BY month, type
ORDER BY month, type;
