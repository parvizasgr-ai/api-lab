-- 006_api_v2.sql — Callbox API v2 (developer portal / API Reference) üçün sxem dəyişiklikləri
--   * currencies: ISO 4217 rəqəm kodu və onluq rəqəm sayı (GET /api/v2/currencies)
--   * cards: kart sifarişi sahələri (POST /api/v2/cards) — fiziki/virtual, kartdakı ad, çatdırılma
--   * deposits: depozit rəsmiləşdirmə (POST /api/v2/deposits) — vəsait hesabdan çıxılır, bağlananda geri yazılır
--   * flight_bookings / hotel_bookings: qonaq bronu (auth-suz, v2) — user_id NULL ola bilər, əvəzində əlaqə e-poçtu məcburidir
--     v1 bronları (user_id ilə) və v2 qonaq bronları EYNİ cədvəldədir → otaq/yer əlçatanlığı hər iki versiyada düzgün hesablanır

ALTER TABLE currencies
  ADD COLUMN numeric_code TEXT CHECK (numeric_code ~ '^[0-9]{3}$'),
  ADD COLUMN minor_units  INTEGER NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4);

ALTER TABLE cards
  ADD COLUMN card_type        TEXT NOT NULL DEFAULT 'PHYSICAL' CHECK (card_type IN ('PHYSICAL', 'VIRTUAL')),
  ADD COLUMN name_on_card     TEXT CHECK (length(name_on_card) BETWEEN 2 AND 26),
  ADD COLUMN delivery_method  TEXT CHECK (delivery_method IN ('BRANCH', 'COURIER')),
  ADD COLUMN delivery_details TEXT; -- filial kodu (BRANCH) və ya ünvan (COURIER)

CREATE TABLE deposits (
  id                TEXT    PRIMARY KEY,                       -- dep_ + 12 hex
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_account_id TEXT    NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  currency          TEXT    NOT NULL REFERENCES currencies(code),
  principal_minor   INTEGER NOT NULL CHECK (principal_minor > 0),
  term_months       INTEGER NOT NULL CHECK (term_months IN (3, 6, 12, 24)),
  annual_rate       NUMERIC(5, 2) NOT NULL CHECK (annual_rate >= 0),
  interest_payout   TEXT    NOT NULL CHECK (interest_payout IN ('MONTHLY', 'AT_MATURITY')),
  auto_renew        BOOLEAN NOT NULL DEFAULT false,
  status            TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  opened_at         TEXT    NOT NULL,
  maturity_date     TEXT    NOT NULL,
  closed_at         TEXT,
  interest_paid_minor INTEGER CHECK (interest_paid_minor >= 0),
  CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);
CREATE INDEX deposits_owner_idx ON deposits (owner_id, opened_at DESC);

ALTER TABLE transactions ADD COLUMN deposit_id TEXT REFERENCES deposits(id) ON DELETE RESTRICT;

ALTER TABLE flight_bookings
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN pnr           TEXT UNIQUE CHECK (pnr ~ '^[A-Z0-9]{6}$'),
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT,
  ADD CONSTRAINT flight_bookings_owner_chk CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL);

ALTER TABLE flight_passengers
  ADD COLUMN passenger_type TEXT CHECK (passenger_type IN ('ADULT', 'CHILD')),
  ADD COLUMN birth_date     TEXT,
  ADD COLUMN nationality    TEXT CHECK (nationality ~ '^[A-Z]{2}$'),
  ADD COLUMN ticket_number  TEXT UNIQUE;

ALTER TABLE hotel_bookings
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN confirmation_code TEXT UNIQUE,
  ADD COLUMN guest_name        TEXT,
  ADD COLUMN contact_email     TEXT,
  ADD COLUMN contact_phone     TEXT,
  ADD COLUMN special_requests  TEXT,
  ADD CONSTRAINT hotel_bookings_owner_chk CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL);
