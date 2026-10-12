-- 08. Reys axtarışı (VIEW): Bakı → İstanbul, ən ucuz 10 reys, yeri olanlar
-- GET /api/v1/flights/search?from=GYD&to=IST&sort=price nəticəsi ilə müqayisə et.
SELECT flight_id, flight_no, airline_name, depart_at, duration_min, stops, price, currency, seats_left
FROM v_flight_search
WHERE from_city = 'Bakı' AND to_city = 'İstanbul' AND sold_out = 0
ORDER BY price, depart_at
LIMIT 10;
