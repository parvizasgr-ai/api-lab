-- 07. Ən son məzənnələr və 7 gün əvvəlki ilə müqayisə (subquery)
-- Dərs 1: GET /api/v1/currencies/rates?base=AZN cavabı ilə müqayisə et.
SELECT r.quote,
       r.rate                                         AS today,
       (SELECT r7.rate FROM exchange_rates r7
         WHERE r7.base = r.base AND r7.quote = r.quote
           AND r7.rate_date = date(r.rate_date, '-7 days')) AS week_ago,
       ROUND(1.0 / r.rate, 4)                         AS azn_per_unit
FROM exchange_rates r
WHERE r.base = 'AZN'
  AND r.rate_date = (SELECT MAX(rate_date) FROM exchange_rates)
ORDER BY r.quote;
