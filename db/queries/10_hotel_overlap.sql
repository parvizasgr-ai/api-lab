-- 10. Otel otağının tarix kəsişməsi (availability məntiqi SQL ilə)
-- Otaq 1 üçün +6..+7 gün aralığı ilə kəsişən CONFIRMED bron varmı? Sətir varsa → API 409 ROOM_NOT_AVAILABLE qaytarmalıdır.
-- Qayda: yeni.check_in < mövcud.check_out AND yeni.check_out > mövcud.check_in
SELECT b.id, b.room_id, b.check_in, b.check_out, b.status, u.username
FROM hotel_bookings b
JOIN users u ON u.id = b.user_id
WHERE b.room_id = 1
  AND b.status = 'CONFIRMED'
  AND date('now', '+6 days') < b.check_out
  AND date('now', '+7 days') > b.check_in;
