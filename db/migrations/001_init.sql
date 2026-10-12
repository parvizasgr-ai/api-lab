-- 001_init.sql — API Lab əsas sxemi
-- Konvensiyalar:
--   * Vaxt sahələri ISO-8601 UTC mətn kimi saxlanır: '2026-10-12T08:30:00Z' (sıralama və müqayisə mətn kimi düzgün işləyir).
--   * Tarix sahələri (check_in, rate_date) 'YYYY-MM-DD'.
--   * Pul məbləğləri *_minor INTEGER (qəpik/sent) — float yuvarlaqlaşdırma xətası olmasın deyə. API-də decimal göstərilir.
--   * Status sahələri CHECK ... IN (...) ilə məhdudlaşdırılır — DB səviyyəsində "enum".

-- ============================================================
-- AUTH
-- ============================================================

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

-- OAuth2 scope-lar (məs. cards:write). JWT-nin "scope" claim-i buradan yığılır.
CREATE TABLE user_scopes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope   TEXT    NOT NULL,
  PRIMARY KEY (user_id, scope)
);

-- Refresh token-in özü yox, SHA-256 hash-i saxlanır (DB oğurlansa belə token istifadə oluna bilməz).
CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,
  revoked_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE api_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash      TEXT    NOT NULL UNIQUE,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Mock "Google" Authorization Server-in qeydiyyatlı client-ləri.
CREATE TABLE oauth_clients (
  client_id          TEXT PRIMARY KEY,
  client_secret_hash TEXT NOT NULL,
  name               TEXT NOT NULL,
  redirect_uris      TEXT NOT NULL CHECK (json_valid(redirect_uris))   -- JSON massiv
);

-- Authorization Code: birdəfəlikdir (used_at) və 60 saniyə yaşayır (expires_at).
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

-- ============================================================
-- BANK + VALYUTA
-- ============================================================

CREATE TABLE currencies (
  code   TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),
  name   TEXT NOT NULL,
  symbol TEXT NOT NULL
);

CREATE TABLE accounts (
  id            TEXT    PRIMARY KEY,                    -- məs. 'AZ21NABZ0001'
  owner_id      INTEGER NOT NULL REFERENCES users(id),
  currency      TEXT    NOT NULL REFERENCES currencies(code),
  balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),   -- mənfi balans DB tərəfindən qadağandır
  type          TEXT    NOT NULL CHECK (type IN ('CURRENT', 'SAVINGS')),
  opened_at     TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_accounts_owner ON accounts(owner_id);

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
CREATE INDEX idx_cards_owner ON cards(owner_id);
CREATE INDEX idx_cards_account ON cards(account_id);

-- Trigger (002) tərəfindən avtomatik doldurulur: cards.status dəyişəndə 1 sətir.
CREATE TABLE card_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    INTEGER NOT NULL REFERENCES cards(id),
  old_status TEXT    NOT NULL,
  new_status TEXT    NOT NULL,
  reason     TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT    NOT NULL
);
CREATE INDEX idx_card_history_card ON card_status_history(card_id, changed_at);

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

-- Hər köçürmə 2 sətir yaradır: göndərəndə DEBIT, alanda CREDIT (eyni transfer_id ilə).
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
CREATE INDEX idx_transactions_account_date ON transactions(account_id, created_at);
CREATE INDEX idx_transactions_transfer ON transactions(transfer_id);

-- 1 base = rate quote. Məs. base='AZN', quote='USD', rate=0.588235 → 1 AZN = 0.588235 USD.
CREATE TABLE exchange_rates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  base      TEXT    NOT NULL REFERENCES currencies(code),
  quote     TEXT    NOT NULL REFERENCES currencies(code),
  rate      NUMERIC NOT NULL CHECK (rate > 0),
  rate_date TEXT    NOT NULL,
  UNIQUE (base, quote, rate_date),
  CHECK (base <> quote)
);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(rate_date);

-- ============================================================
-- AVİABİLET
-- ============================================================

CREATE TABLE airports (
  code    TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),   -- IATA kodu
  city    TEXT NOT NULL,
  country TEXT NOT NULL,
  name    TEXT NOT NULL
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
CREATE INDEX idx_flights_route_date ON flights(from_code, to_code, depart_at);

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
CREATE INDEX idx_flight_bookings_user ON flight_bookings(user_id);
CREATE INDEX idx_flight_bookings_flight ON flight_bookings(flight_id);

CREATE TABLE flight_passengers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id         INTEGER NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  first_name         TEXT    NOT NULL,
  last_name          TEXT    NOT NULL,
  passport_no_masked TEXT                               -- məs. 'C****1234' (şəxsi data maskalanır)
);
CREATE INDEX idx_flight_passengers_booking ON flight_passengers(booking_id);

-- ============================================================
-- OTEL
-- ============================================================

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
CREATE INDEX idx_hotels_city ON hotels(city);

CREATE TABLE hotel_amenities (
  hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  amenity  TEXT    NOT NULL,
  PRIMARY KEY (hotel_id, amenity)
);

CREATE TABLE hotel_rooms (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id              INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type             TEXT    NOT NULL CHECK (room_type IN ('SINGLE', 'DOUBLE', 'SUITE', 'FAMILY')),
  capacity              INTEGER NOT NULL CHECK (capacity >= 1),
  price_per_night_minor INTEGER NOT NULL CHECK (price_per_night_minor > 0)
);
CREATE INDEX idx_hotel_rooms_hotel ON hotel_rooms(hotel_id);

-- Availability qaydası: eyni otaq üçün CONFIRMED bronların tarixləri kəsişə bilməz
-- (yeni.check_in < mövcud.check_out AND yeni.check_out > mövcud.check_in → 409). Yoxlama transaction daxilində SQL ilə edilir.
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
CREATE INDEX idx_hotel_bookings_room_dates ON hotel_bookings(room_id, check_in, check_out);
CREATE INDEX idx_hotel_bookings_user ON hotel_bookings(user_id);

-- ============================================================
-- MÜŞTƏRİLƏR (CRUD nümunəsi)
-- ============================================================

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
CREATE INDEX idx_customers_city ON customers(city);

-- ============================================================
-- KİTAB
-- ============================================================

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
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_genre ON books(genre);

CREATE TABLE book_reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (book_id, user_id)                              -- bir istifadəçi bir kitaba 1 rəy
);

-- ============================================================
-- MUSİQİ (YouTube yalnız mənbədir; video fayl saxlanmır)
-- ============================================================

CREATE TABLE tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id   TEXT    NOT NULL UNIQUE CHECK (length(youtube_id) = 11),
  title        TEXT    NOT NULL,
  artist       TEXT    NOT NULL,
  genre        TEXT    NOT NULL,
  duration_sec INTEGER NOT NULL CHECK (duration_sec > 0)
);
CREATE INDEX idx_tracks_artist ON tracks(artist);

CREATE TABLE playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_playlists_user ON playlists(user_id);

CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id),
  position    INTEGER NOT NULL CHECK (position >= 1),
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE play_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id  INTEGER NOT NULL REFERENCES tracks(id),
  played_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_play_history_user ON play_history(user_id, played_at);

-- ============================================================
-- TEXNİKİ (cross-cutting)
-- ============================================================

-- Idempotency-Key: eyni açarla təkrar sorğu → saxlanmış cavab qaytarılır, əməliyyat təkrarlanmır. 24 saat saxlanır.
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
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

-- Hər HTTP sorğusu (API Explorer "History" və admin statistikası üçün). user_id-də FK yoxdur: log həmişə yazılmalıdır.
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
CREATE INDEX idx_request_log_created ON request_log(created_at);
CREATE INDEX idx_request_log_user ON request_log(user_id, created_at);

-- Rate limit (fixed window, 60 san): subject = 'user:1' | 'apikey:2' | 'ip:127.0.0.1'.
CREATE TABLE rate_limit_counters (
  subject      TEXT    NOT NULL,
  window_start TEXT    NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (subject, window_start)
);
