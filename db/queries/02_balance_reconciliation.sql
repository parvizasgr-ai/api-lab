-- 02. Balans uzlaşması (JOIN + GROUP BY + HAVING)
-- Hər hesab üçün CREDIT − DEBIT cəmi balance_minor-a bərabər olmalıdır. Nəticə BOŞDURSA — hər şey düzgündür.
-- Transfer atomikliyini yoxlamaq üçün: köçürmədən sonra bu sorğu yenə boş qalmalıdır.
SELECT a.id, a.balance_minor,
       SUM(CASE t.type WHEN 'CREDIT' THEN t.amount_minor ELSE -t.amount_minor END) AS calculated_minor
FROM accounts a
JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.balance_minor
HAVING a.balance_minor <> SUM(CASE t.type WHEN 'CREDIT' THEN t.amount_minor ELSE -t.amount_minor END);
