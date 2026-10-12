-- 002_views_triggers.sql — tələbələr üçün view-lar (SQL praktikası) və avtomatik audit trigger-ləri

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Kart statusu dəyişəndə tarixçəyə avtomatik 1 sətir yazılır.
-- Kim və niyə dəyişdi? → UPDATE eyni anda status_reason və status_changed_by sütunlarını da yazır, trigger NEW.* -dan oxuyur.
CREATE TRIGGER trg_cards_status_history
AFTER UPDATE OF status ON cards
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO card_status_history (card_id, old_status, new_status, reason, changed_by, changed_at)
  VALUES (NEW.id, OLD.status, NEW.status, NEW.status_reason, NEW.status_changed_by, NEW.updated_at);
END;

-- Hər yeni əməliyyat (DEBIT/CREDIT) audit_log-a düşür. user_id = hesabın sahibi.
CREATE TRIGGER trg_transactions_audit
AFTER INSERT ON transactions
BEGIN
  INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at)
  SELECT a.owner_id,
         'TRANSACTION_' || NEW.type,
         'transactions',
         CAST(NEW.id AS TEXT),
         json_object('accountId', NEW.account_id, 'amountMinor', NEW.amount_minor,
                     'currency', NEW.currency, 'transferId', NEW.transfer_id),
         NEW.created_at
  FROM accounts a
  WHERE a.id = NEW.account_id;
END;

-- ============================================================
-- VIEWS
-- ============================================================

-- Hesab balansları: sahib adı + decimal balans + əməliyyat sayı.
CREATE VIEW v_account_balances AS
SELECT a.id                                 AS account_id,
       a.owner_id,
       u.username,
       u.full_name                          AS owner_name,
       a.type,
       a.currency,
       a.balance_minor,
       ROUND(a.balance_minor / 100.0, 2)    AS balance,
       (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS transaction_count,
       a.opened_at
FROM accounts a
JOIN users u ON u.id = a.owner_id;

-- Kartlar: hesab, sahib və son status dəyişikliyi (correlated subquery).
CREATE VIEW v_card_overview AS
SELECT c.id                                     AS card_id,
       u.username                               AS owner,
       c.brand,
       '**** ' || c.last4                       AS masked_number,
       c.status,
       c.status_reason,
       c.account_id,
       a.currency,
       ROUND(c.daily_limit_minor / 100.0, 2)    AS daily_limit,
       c.expires_at,
       (SELECT h.changed_at FROM card_status_history h
         WHERE h.card_id = c.id ORDER BY h.changed_at DESC, h.id DESC LIMIT 1) AS last_status_change_at,
       (SELECT COUNT(*) FROM card_status_history h WHERE h.card_id = c.id)     AS status_change_count
FROM cards c
JOIN users u    ON u.id = c.owner_id
JOIN accounts a ON a.id = c.account_id;

-- Reys axtarışı: şəhər adları ilə (airports cədvəlinə 2 dəfə JOIN — alias nümunəsi).
CREATE VIEW v_flight_search AS
SELECT f.id                               AS flight_id,
       f.flight_no,
       f.airline_name,
       f.from_code,
       fa.city                            AS from_city,
       f.to_code,
       ta.city                            AS to_city,
       date(f.depart_at)                  AS depart_date,
       f.depart_at,
       f.arrive_at,
       f.duration_min,
       f.stops,
       ROUND(f.price_minor / 100.0, 2)    AS price,
       f.currency,
       f.seats_left,
       CASE WHEN f.seats_left = 0 THEN 1 ELSE 0 END AS sold_out
FROM flights f
JOIN airports fa ON fa.code = f.from_code
JOIN airports ta ON ta.code = f.to_code;

-- Otaqların bu günkü vəziyyəti: bu gün dolu/boş və növbəti bron tarixi.
CREATE VIEW v_hotel_availability AS
SELECT r.id                                         AS room_id,
       h.id                                         AS hotel_id,
       h.name                                       AS hotel_name,
       h.city,
       h.stars,
       r.room_type,
       r.capacity,
       ROUND(r.price_per_night_minor / 100.0, 2)    AS price_per_night,
       h.currency,
       EXISTS (SELECT 1 FROM hotel_bookings b
                WHERE b.room_id = r.id AND b.status = 'CONFIRMED'
                  AND b.check_in <= date('now') AND b.check_out > date('now')) AS occupied_today,
       (SELECT MIN(b.check_in) FROM hotel_bookings b
         WHERE b.room_id = r.id AND b.status = 'CONFIRMED' AND b.check_in > date('now')) AS next_booking_check_in,
       (SELECT COUNT(*) FROM hotel_bookings b
         WHERE b.room_id = r.id AND b.status = 'CONFIRMED' AND b.check_out > date('now')) AS upcoming_bookings
FROM hotel_rooms r
JOIN hotels h ON h.id = r.hotel_id;

-- API istifadə statistikası (request_log üzrə GROUP BY): hansı endpoint nə qədər çağırılıb, orta cavab müddəti, xəta sayı.
CREATE VIEW v_api_usage_by_endpoint AS
SELECT method,
       COALESCE(route, path)                               AS endpoint,
       COUNT(*)                                            AS calls,
       ROUND(AVG(duration_ms), 1)                          AS avg_ms,
       MAX(duration_ms)                                    AS max_ms,
       SUM(CASE WHEN status BETWEEN 200 AND 399 THEN 1 ELSE 0 END) AS ok_count,
       SUM(CASE WHEN status BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS client_errors,
       SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END)      AS server_errors,
       MAX(created_at)                                     AS last_called_at
FROM request_log
GROUP BY method, COALESCE(route, path);
