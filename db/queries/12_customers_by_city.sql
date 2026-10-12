-- 12. Müştərilər şəhərlər üzrə (GROUP BY) — Dərs 2: POST/PUT/DELETE /customers-dən sonra dəyişikliyi gör
SELECT city,
       COUNT(*)                                     AS total,
       SUM(active)                                  AS active,
       COUNT(*) - SUM(active)                       AS inactive,
       MAX(updated_at)                              AS last_change
FROM customers
GROUP BY city
ORDER BY total DESC;
