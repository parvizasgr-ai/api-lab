-- 11. Şəhərlər üzrə otel statistikası (GROUP BY + aggregate) + bu gün boş otaq sayı (VIEW)
SELECT city,
       COUNT(DISTINCT hotel_id)                          AS hotels,
       COUNT(*)                                          AS rooms,
       SUM(CASE WHEN occupied_today = 0 THEN 1 ELSE 0 END) AS free_today,
       MIN(price_per_night) || ' ' || MIN(currency)      AS cheapest
FROM v_hotel_availability
GROUP BY city
ORDER BY hotels DESC, city;
