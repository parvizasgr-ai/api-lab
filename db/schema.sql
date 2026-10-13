-- AUTO-GENERATED: `npm run db:reset` tərəfindən yaradılır. Dəyişiklik üçün db/migrations/ istifadə edin.

CREATE TABLE accounts (
  id            TEXT    PRIMARY KEY,                    -- məs. 'AZ21NABZ0001'
  owner_id      INTEGER NOT NULL REFERENCES users(id),
  currency      TEXT    NOT NULL REFERENCES currencies(code),
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),   -- mənfi balans DB tərəfindən qadağandır
  type          TEXT    NOT NULL CHECK (type IN ('CURRENT', 'SAVINGS')),
  opened_at     TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE airports (
  code    TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),   -- IATA kodu
  city    TEXT NOT NULL,
  country TEXT NOT NULL,
  name    TEXT NOT NULL
);

CREATE TABLE api_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash      TEXT    NOT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT    NOT NULL,                          -- məs. 'CARD_BLOCKED', 'TRANSACTION_DEBIT'
  entity     TEXT    NOT NULL,
  entity_id  TEXT    NOT NULL,
  details    TEXT    CHECK (details IS NULL OR json_valid(details)),
  ip         TEXT,
  request_id TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE book_reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (book_id, user_id)                              -- bir istifadəçi bir kitaba 1 rəy
);

CREATE TABLE books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  author      TEXT    NOT NULL,
  genre       TEXT    NOT NULL,
  year        INTEGER CHECK (year BETWEEN 1000 AND 2100),   -- NULL = dəqiq il məlum deyil
  description TEXT    NOT NULL,
  rating      REAL    NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  pages       INTEGER NOT NULL CHECK (pages > 0)
);

CREATE TABLE card_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id),
  old_status TEXT    NOT NULL,
  new_status TEXT    NOT NULL,
  reason     TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT    NOT NULL
);

CREATE TABLE cards (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          INTEGER NOT NULL REFERENCES users(id),
  account_id        TEXT    NOT NULL REFERENCES accounts(id),
  last4             TEXT    NOT NULL CHECK (length(last4) = 4),
  brand             TEXT    NOT NULL CHECK (brand IN ('VISA', 'MASTERCARD')),
  status            TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'EXPIRED')),
  status_reason     TEXT    CHECK (status_reason IN ('LOST', 'STOLEN', 'SUSPECTED_FRAUD')),
  status_changed_by INTEGER REFERENCES users(id),
  daily_limit_minor INTEGER NOT NULL CHECK (daily_limit_minor > 0),
  expires_at        TEXT    NOT NULL,                   -- kartın son istifadə tarixi (YYYY-MM-DD)
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE currencies (
  code   TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),
  name   TEXT NOT NULL,
  symbol TEXT NOT NULL
);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT    NOT NULL,
  last_name  TEXT    NOT NULL,
  email      TEXT    NOT NULL UNIQUE,                   -- təkrar email → 409 EMAIL_EXISTS
  phone      TEXT,
  city       TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))   -- ETag bundan hesablanır
);

CREATE TABLE exchange_rates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  base      TEXT    NOT NULL REFERENCES currencies(code),
  quote     TEXT    NOT NULL REFERENCES currencies(code),
  rate      NUMERIC NOT NULL CHECK (rate > 0),
  rate_date TEXT    NOT NULL,
  UNIQUE (base, quote, rate_date),
  CHECK (base <> quote)
);

CREATE TABLE flight_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id   INTEGER NOT NULL REFERENCES flights(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  passengers  INTEGER NOT NULL CHECK (passengers >= 1),
  status      TEXT    NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  currency    TEXT    NOT NULL REFERENCES currencies(code),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE flight_passengers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id         INTEGER NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  first_name         TEXT    NOT NULL,
  last_name          TEXT    NOT NULL,
  passport_no_masked TEXT                               -- məs. 'C****1234' (şəxsi data maskalanır)
);

CREATE TABLE flights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_no    TEXT    NOT NULL,                        -- məs. 'J2 071'
  airline_code TEXT    NOT NULL,
  airline_name TEXT    NOT NULL,
  from_code    TEXT    NOT NULL REFERENCES airports(code),
  to_code      TEXT    NOT NULL REFERENCES airports(code),
  depart_at    TEXT    NOT NULL,
  arrive_at    TEXT    NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  stops        INTEGER NOT NULL DEFAULT 0 CHECK (stops >= 0),
  price_minor  INTEGER NOT NULL CHECK (price_minor > 0),  -- 1 sərnişin üçün
  currency     TEXT    NOT NULL REFERENCES currencies(code),
  seats_left   INTEGER NOT NULL CHECK (seats_left >= 0),
  CHECK (from_code <> to_code),
  CHECK (arrive_at > depart_at)
);

CREATE TABLE hotel_amenities (
  hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amenity  TEXT    NOT NULL,
  PRIMARY KEY (hotel_id, amenity)
);

CREATE TABLE hotel_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id     INTEGER NOT NULL REFERENCES hotel_rooms(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  check_in    TEXT    NOT NULL,
  check_out   TEXT    NOT NULL,
  guests      INTEGER NOT NULL CHECK (guests >= 1),
  status      TEXT    NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  currency    TEXT    NOT NULL REFERENCES currencies(code),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (check_out > check_in)
);

CREATE TABLE hotel_rooms (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id              INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type             TEXT    NOT NULL CHECK (room_type IN ('SINGLE', 'DOUBLE', 'SUITE', 'FAMILY')),
  capacity              INTEGER NOT NULL CHECK (capacity >= 1),
  price_per_night_minor INTEGER NOT NULL CHECK (price_per_night_minor > 0)
);

CREATE TABLE hotels (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  city                  TEXT    NOT NULL,
  name                  TEXT    NOT NULL,
  stars                 INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  price_per_night_minor INTEGER NOT NULL CHECK (price_per_night_minor > 0),   -- ən ucuz otağın qiyməti ("...-dan başlayan")
  currency              TEXT    NOT NULL REFERENCES currencies(code),
  rating                REAL    NOT NULL CHECK (rating BETWEEN 0 AND 10),
  description           TEXT    NOT NULL
);

CREATE TABLE idempotency_keys (
  key             TEXT    NOT NULL,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT    NOT NULL,                     -- məs. 'POST /api/v1/transfers'
  request_hash    TEXT    NOT NULL,                     -- eyni key + fərqli body → 422
  response_status INTEGER NOT NULL,
  response_body   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at      TEXT    NOT NULL,
  PRIMARY KEY (key, user_id, endpoint)
);

CREATE TABLE material_pages (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_no     INTEGER NOT NULL CHECK (page_no >= 1),
  image_name  TEXT    NOT NULL,                                    -- 1600px eni
  thumb_name  TEXT    NOT NULL,                                    -- 320px eni
  PRIMARY KEY (material_id, page_no)
);

CREATE TABLE materials (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson            INTEGER CHECK (lesson IN (1, 2, 3)),          -- NULL = ümumi material
  title             TEXT    NOT NULL,
  description       TEXT,
  kind              TEXT    NOT NULL CHECK (kind IN ('SLIDES', 'DOCUMENT', 'TASKSHEET', 'OTHER')),
  original_filename TEXT    NOT NULL,                              -- yalnız göstərmək üçün, HEÇ VAXT fayl yolu kimi istifadə olunmur
  stored_name       TEXT    NOT NULL UNIQUE,                       -- təsadüfi ad: m_<hex>.<ext>
  mime              TEXT    NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes > 0),
  page_count        INTEGER CHECK (page_count >= 0),
  status            TEXT    NOT NULL DEFAULT 'UPLOADED'
                    CHECK (status IN ('UPLOADED', 'CONVERTING', 'READY', 'READY_NO_PREVIEW', 'FAILED')),
  error_message     TEXT,
  uploaded_by       INTEGER REFERENCES users(id),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE oauth_clients (
  client_id          TEXT PRIMARY KEY,
  client_secret_hash TEXT NOT NULL,
  name               TEXT NOT NULL,
  redirect_uris      TEXT NOT NULL CHECK (json_valid(redirect_uris))   -- JSON massiv
);

CREATE TABLE oauth_codes (
  code         TEXT    PRIMARY KEY,
  client_id    TEXT    NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope        TEXT    NOT NULL,
  redirect_uri TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  used_at      TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE play_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id  INTEGER NOT NULL REFERENCES tracks(id),
  played_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id),
  position    INTEGER NOT NULL CHECK (position >= 1),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE rate_limit_counters (
  subject      TEXT    NOT NULL,
  window_start TEXT    NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (subject, window_start)
);

CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,
  revoked_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
, scope TEXT);

CREATE TABLE request_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  TEXT    NOT NULL,
  user_id     INTEGER,
  method      TEXT    NOT NULL,
  path        TEXT    NOT NULL,                         -- real URL: /api/v1/cards/3
  route       TEXT,                                     -- OpenAPI şablonu: /api/v1/cards/{id}
  status      INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

CREATE TABLE task_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  done_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, task_id)
);

CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson          INTEGER NOT NULL CHECK (lesson IN (1, 2, 3)),
  title           TEXT    NOT NULL,
  description_md  TEXT    NOT NULL DEFAULT '',
  method          TEXT    NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  path            TEXT    NOT NULL CHECK (substr(path, 1, 1) = '/'),
  expected_status INTEGER NOT NULL CHECK (expected_status BETWEEN 100 AND 599),
  sql_check       TEXT,                                            -- SQL Playground-da işlədiləcək SELECT
  material_id     INTEGER REFERENCES materials(id) ON DELETE SET NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (lesson, title)                                           -- markdown import "upsert" bu açarla işləyir
);

CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id   TEXT    NOT NULL UNIQUE CHECK (length(youtube_id) = 11),
  title        TEXT    NOT NULL,
  artist       TEXT    NOT NULL,
  genre        TEXT    NOT NULL,
  duration_sec INTEGER NOT NULL CHECK (duration_sec > 0)
);

CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   TEXT    NOT NULL REFERENCES accounts(id),
  type         TEXT    NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency     TEXT    NOT NULL REFERENCES currencies(code),
  description  TEXT    NOT NULL,
  transfer_id  INTEGER REFERENCES transfers(id),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE transfers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_account TEXT    NOT NULL REFERENCES accounts(id),
  to_account   TEXT    NOT NULL REFERENCES accounts(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency     TEXT    NOT NULL REFERENCES currencies(code),
  status       TEXT    NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (from_account <> to_account)
);

CREATE TABLE user_scopes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope   TEXT    NOT NULL,
  PRIMARY KEY (user_id, scope)
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,                       -- scrypt hash, heç vaxt API-də qaytarılmır
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  role          TEXT    NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_accounts_owner ON accounts(owner_id);

CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

CREATE INDEX idx_books_author ON books(author);

CREATE INDEX idx_books_genre ON books(genre);

CREATE INDEX idx_card_history_card ON card_status_history(card_id, changed_at);

CREATE INDEX idx_cards_account ON cards(account_id);

CREATE INDEX idx_cards_owner ON cards(owner_id);

CREATE INDEX idx_customers_city ON customers(city);

CREATE INDEX idx_exchange_rates_date ON exchange_rates(rate_date);

CREATE INDEX idx_flight_bookings_flight ON flight_bookings(flight_id);

CREATE INDEX idx_flight_bookings_user ON flight_bookings(user_id);

CREATE INDEX idx_flight_passengers_booking ON flight_passengers(booking_id);

CREATE INDEX idx_flights_route_date ON flights(from_code, to_code, depart_at);

CREATE INDEX idx_hotel_bookings_room_dates ON hotel_bookings(room_id, check_in, check_out);

CREATE INDEX idx_hotel_bookings_user ON hotel_bookings(user_id);

CREATE INDEX idx_hotel_rooms_hotel ON hotel_rooms(hotel_id);

CREATE INDEX idx_hotels_city ON hotels(city);

CREATE INDEX idx_materials_lesson ON materials(lesson, sort_order);

CREATE INDEX idx_materials_status ON materials(status);

CREATE INDEX idx_play_history_user ON play_history(user_id, played_at);

CREATE INDEX idx_playlists_user ON playlists(user_id);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE INDEX idx_request_log_created ON request_log(created_at);

CREATE INDEX idx_request_log_user ON request_log(user_id, created_at);

CREATE INDEX idx_task_progress_task ON task_progress(task_id);

CREATE INDEX idx_tasks_lesson ON tasks(lesson, sort_order);

CREATE INDEX idx_tasks_material ON tasks(material_id);

CREATE INDEX idx_tracks_artist ON tracks(artist);

CREATE INDEX idx_transactions_account_date ON transactions(account_id, created_at);

CREATE INDEX idx_transactions_transfer ON transactions(transfer_id);

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

CREATE VIEW v_material_overview AS
SELECT m.id                                                     AS material_id,
       m.lesson,
       m.title,
       m.kind,
       m.status,
       m.original_filename,
       ROUND(m.size_bytes / 1048576.0, 2)                       AS size_mb,
       (SELECT COUNT(*) FROM material_pages p WHERE p.material_id = m.id) AS pages,
       u.username                                               AS uploaded_by,
       (SELECT COUNT(*) FROM tasks t WHERE t.material_id = m.id) AS tasks,
       (SELECT COUNT(DISTINCT tp.user_id) FROM task_progress tp JOIN tasks t ON t.id = tp.task_id
         WHERE t.material_id = m.id)                            AS students_with_progress,
       m.created_at
FROM materials m
LEFT JOIN users u ON u.id = m.uploaded_by;

CREATE TRIGGER trg_cards_status_history
AFTER UPDATE OF status ON cards
WHEN OLD.status <> NEW.status
BEGIN
  INSERT INTO card_status_history (card_id, old_status, new_status, reason, changed_by, changed_at)
  VALUES (NEW.id, OLD.status, NEW.status, NEW.status_reason, NEW.status_changed_by, NEW.updated_at);
END;

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
