-- 11. Şəhərlər üzrə otel statistikası (GROUP BY + aggregate) + bu gün boş otaq sayı (VIEW)
SELECT city,
       COUNT(DISTINCT hotel_id)                          AS hotels,
       COUNT(*)                                          AS rooms,
       COUNT(*) FILTER (WHERE NOT occupied_today)         AS free_today,
       MIN(price_per_night) || ' ' || MIN(currency)      AS cheapest
FROM v_hotel_availability
GROUP BY city
ORDER BY hotels DESC, city;
