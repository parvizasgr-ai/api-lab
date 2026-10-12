-- 09. Mənim aviabilet bronlarım + sərnişinlər (3 cədvəl JOIN)
-- POST /api/v1/flights/bookings-dən sonra: yeni bron + seats_left azalıb?
SELECT b.id AS booking_id, b.status, f.flight_no, f.from_code || ' → ' || f.to_code AS route,
       f.depart_at, f.seats_left, b.passengers,
       GROUP_CONCAT(p.first_name || ' ' || p.last_name, ', ') AS passenger_names,
       ROUND(b.total_minor / 100.0, 2) AS total, b.currency
FROM flight_bookings b
JOIN users u   ON u.id = b.user_id
JOIN flights f ON f.id = b.flight_id
LEFT JOIN flight_passengers p ON p.booking_id = b.id
WHERE u.username = 'student'
GROUP BY b.id
ORDER BY b.id DESC;
