-- 02_bank.sql — valyutalar, məzənnələr, hesablar, kartlar, köçürmələr, əməliyyatlar

INSERT INTO currencies (code, name, symbol, numeric_code, minor_units) VALUES
  ('AZN', 'Azərbaycan manatı', '₼', '944', 2),
  ('USD', 'ABŞ dolları', '$', '840', 2),
  ('EUR', 'Avro', '€', '978', 2),
  ('TRY', 'Türk lirəsi', '₺', '949', 2),
  ('GBP', 'Britaniya funt sterlinqi', '£', '826', 2),
  ('GEL', 'Gürcüstan larisi', '₾', '981', 2),
  ('AED', 'BƏƏ dirhəmi', 'د.إ', '784', 2);

-- Son 30 günün məzənnələri (base=AZN). Recursive CTE ilə gün ardıcıllığı yaradılır.
-- Dəyişkənlik təsadüfi deyil, düsturla hesablanır → hər reset eyni rəqəmləri verir. USD manata bağlıdır (1.70).
WITH RECURSIVE days(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM days WHERE n < 29
),
base_rates(k, quote, azn_per_unit, volatile) AS (
  VALUES (1, 'USD', 1.7000, 0), (2, 'EUR', 1.9750, 1), (3, 'TRY', 0.0410, 1),
         (4, 'GBP', 2.2800, 1), (5, 'GEL', 0.6290, 1), (6, 'AED', 0.4629, 0)
)
INSERT INTO exchange_rates (base, quote, rate, rate_date)
SELECT 'AZN', b.quote,
       ROUND(1.0 / (b.azn_per_unit * (1 + b.volatile * ((d.n * 7 + b.k * 3) % 13 - 6) * 0.0007)), 6),
       seed_date('now', ('-' || d.n || ' days')::interval)
FROM days d CROSS JOIN base_rates b
ORDER BY d.n DESC, b.k;

-- Hesablar. balance_minor sonda əməliyyatların cəmindən hesablanır (aşağıda UPDATE).
INSERT INTO accounts (id, owner_id, currency, balance_minor, type, opened_at, updated_at) VALUES
  ('AZ21NABZ0001', 1, 'AZN', 0, 'CURRENT', seed_ts('day', ('-380 days')::interval + ('+10 hours')::interval), seed_ts('day', ('-1 days')::interval + ('+19 hours')::interval)),
  ('AZ21NABZ0002', 1, 'USD', 0, 'SAVINGS', seed_ts('day', ('-300 days')::interval + ('+11 hours')::interval), seed_ts('day', ('-12 days')::interval + ('+14 hours')::interval)),
  ('AZ21NABZ0003', 1, 'EUR', 0, 'CURRENT', seed_ts('day', ('-200 days')::interval + ('+12 hours')::interval), seed_ts('day', ('-10 days')::interval + ('+8 hours')::interval)),
  ('AZ21NABZ0004', 3, 'AZN', 0, 'CURRENT', seed_ts('day', ('-190 days')::interval + ('+10 hours')::interval), seed_ts('day', ('-2 days')::interval + ('+18 hours')::interval)),
  ('AZ21NABZ0005', 3, 'USD', 0, 'CURRENT', seed_ts('day', ('-150 days')::interval + ('+15 hours')::interval), seed_ts('day', ('-9 days')::interval + ('+21 hours')::interval)),
  ('AZ21NABZ0006', 2, 'AZN', 0, 'CURRENT', seed_ts('day', ('-480 days')::interval + ('+9 hours')::interval), seed_ts('day', ('-14 days')::interval + ('+11 hours')::interval));

-- Kartlar. Əvvəlcə hamısı ACTIVE yaradılır, sonra UPDATE ilə status dəyişdirilir —
-- beləliklə trg_cards_status_history trigger-i card_status_history-ə avtomatik yazır.
INSERT INTO cards (id, owner_id, account_id, last4, brand, status, daily_limit_minor, expires_at, created_at, updated_at) VALUES
  (1, 1, 'AZ21NABZ0001', '4169', 'VISA',       'ACTIVE', 200000, seed_date('month', ('+3 years')::interval + ('-1 day')::interval), seed_ts('day', ('-380 days')::interval + ('+10 hours')::interval), seed_ts('day', ('-380 days')::interval + ('+10 hours')::interval)),
  (2, 1, 'AZ21NABZ0002', '5412', 'MASTERCARD', 'ACTIVE', 100000, seed_date('month', ('+2 years')::interval + ('-1 day')::interval), seed_ts('day', ('-300 days')::interval + ('+11 hours')::interval), seed_ts('day', ('-300 days')::interval + ('+11 hours')::interval)),
  (3, 1, 'AZ21NABZ0001', '7781', 'VISA',       'ACTIVE', 50000,  seed_date('month', ('+4 years')::interval + ('-1 day')::interval), seed_ts('day', ('-100 days')::interval + ('+13 hours')::interval), seed_ts('day', ('-100 days')::interval + ('+13 hours')::interval)),
  (4, 1, 'AZ21NABZ0003', '3307', 'MASTERCARD', 'ACTIVE', 80000,  seed_date('month', ('-2 months')::interval + ('-1 day')::interval), seed_ts('day', ('-200 days')::interval + ('+12 hours')::interval), seed_ts('day', ('-200 days')::interval + ('+12 hours')::interval)),
  (5, 3, 'AZ21NABZ0004', '9021', 'VISA',       'ACTIVE', 150000, seed_date('month', ('+3 years')::interval + ('-1 day')::interval), seed_ts('day', ('-190 days')::interval + ('+10 hours')::interval), seed_ts('day', ('-190 days')::interval + ('+10 hours')::interval)),
  (6, 3, 'AZ21NABZ0005', '1144', 'MASTERCARD', 'ACTIVE', 50000,  seed_date('month', ('+2 years')::interval + ('-1 day')::interval), seed_ts('day', ('-150 days')::interval + ('+15 hours')::interval), seed_ts('day', ('-150 days')::interval + ('+15 hours')::interval)),
  (7, 2, 'AZ21NABZ0006', '6600', 'VISA',       'ACTIVE', 500000, seed_date('month', ('+3 years')::interval + ('-1 day')::interval), seed_ts('day', ('-480 days')::interval + ('+9 hours')::interval),  seed_ts('day', ('-480 days')::interval + ('+9 hours')::interval));

-- Kart 3: tələbə 12 gün əvvəl "itirib" blokladı (unblock dərsi üçün — LOST səbəbi açıla bilər).
UPDATE cards
SET status = 'BLOCKED', status_reason = 'LOST', status_changed_by = 1,
    updated_at = seed_ts('day', ('-12 days')::interval + ('+20 hours')::interval)
WHERE id = 3;

-- Kart 4: müddəti bitib (sistem tərəfindən, changed_by = NULL).
UPDATE cards
SET status = 'EXPIRED',
    updated_at = seed_ts('month', ('-2 months')::interval)
WHERE id = 4;

-- Bir hazır köçürmə: student → rauf, 50.00 AZN (2 əməliyyat sətri ilə əlaqəlidir).
INSERT INTO transfers (id, from_account, to_account, amount_minor, currency, status, created_by, created_at) VALUES
  (1, 'AZ21NABZ0001', 'AZ21NABZ0004', 5000, 'AZN', 'COMPLETED', 1,
      seed_ts('day', ('-3 days')::interval + ('+12 hours')::interval + ('+30 minutes')::interval));

-- Əməliyyatlar: (hesab, tip, məbləğ qəpiklə, təsvir, neçə gün əvvəl, günün dəqiqəsi, transfer_id)
WITH tx(account_id, type, amount_minor, description, days_ago, minute_of_day, transfer_id) AS (
  VALUES
  ('AZ21NABZ0001', 'CREDIT', 150000, 'Açılış balansı',                         380, 610,  NULL),
  ('AZ21NABZ0001', 'CREDIT', 220000, 'Əmək haqqı — Div Academy',                62, 540,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    8540, 'Bravo supermarket',                       58, 1110, NULL),
  ('AZ21NABZ0001', 'DEBIT',    2500, 'Azercell — mobil balans',                 55, 735,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    4120, 'Azərişıq — elektrik',                     50, 600,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    1890, 'Wolt — yemək sifarişi',                   45, 1230, NULL),
  ('AZ21NABZ0001', 'DEBIT',   65000, 'Kontakt Home — noutbuk',                  40, 1020, NULL),
  ('AZ21NABZ0001', 'DEBIT',    1200, 'BakıKart artırılması',                    35, 490,  NULL),
  ('AZ21NABZ0001', 'CREDIT', 220000, 'Əmək haqqı — Div Academy',                32, 540,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    3260, 'Azəriqaz — qaz',                          28, 660,  NULL),
  ('AZ21NABZ0001', 'DEBIT',     950, 'Bolt — taksi',                            25, 1290, NULL),
  ('AZ21NABZ0001', 'DEBIT',   12780, 'Bravo supermarket',                       21, 1140, NULL),
  ('AZ21NABZ0001', 'DEBIT',     640, 'Starbucks — Port Baku',                   18, 570,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    1500, 'Azərsu — su',                             15, 620,  NULL),
  ('AZ21NABZ0001', 'DEBIT',   30000, 'AZAL — hava bileti',                      10, 900,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    1150, 'Wolt — yemək sifarişi',                    6, 1250, NULL),
  ('AZ21NABZ0001', 'DEBIT',    2500, 'Bakcell — mobil balans',                   4, 700,  NULL),
  ('AZ21NABZ0001', 'DEBIT',    5000, 'Köçürmə: AZ21NABZ0004 hesabına',           3, 750,  1),
  ('AZ21NABZ0001', 'DEBIT',     780, 'Bolt — taksi',                             1, 1140, NULL),
  ('AZ21NABZ0002', 'CREDIT', 100000, 'Açılış balansı',                         300, 660,  NULL),
  ('AZ21NABZ0002', 'CREDIT',   2000, 'Əmanət faizi',                            90, 0,    NULL),
  ('AZ21NABZ0002', 'CREDIT',   2000, 'Əmanət faizi',                            60, 0,    NULL),
  ('AZ21NABZ0002', 'CREDIT',   2000, 'Əmanət faizi',                            30, 0,    NULL),
  ('AZ21NABZ0002', 'DEBIT',   15000, 'Amazon.com',                              12, 840,  NULL),
  ('AZ21NABZ0003', 'CREDIT',  50000, 'Açılış balansı',                         200, 720,  NULL),
  ('AZ21NABZ0003', 'DEBIT',   12000, 'Booking.com — otel',                      70, 1300, NULL),
  ('AZ21NABZ0003', 'DEBIT',    1099, 'Spotify Premium',                         40, 480,  NULL),
  ('AZ21NABZ0003', 'DEBIT',    1099, 'Spotify Premium',                         10, 480,  NULL),
  ('AZ21NABZ0004', 'CREDIT', 120000, 'Açılış balansı',                         190, 600,  NULL),
  ('AZ21NABZ0004', 'CREDIT', 180000, 'Əmək haqqı — SOCAR',                      31, 540,  NULL),
  ('AZ21NABZ0004', 'DEBIT',    6420, 'Araz supermarket',                        27, 1150, NULL),
  ('AZ21NABZ0004', 'DEBIT',    2500, 'Azercell — mobil balans',                 20, 710,  NULL),
  ('AZ21NABZ0004', 'DEBIT',   45000, 'Mənzil kirayəsi',                         15, 600,  NULL),
  ('AZ21NABZ0004', 'CREDIT',   5000, 'Köçürmə: AZ21NABZ0001 hesabından',         3, 750,  1),
  ('AZ21NABZ0004', 'DEBIT',    1600, 'Bolt — taksi',                             2, 1080, NULL),
  ('AZ21NABZ0005', 'CREDIT',  30000, 'Açılış balansı',                         150, 900,  NULL),
  ('AZ21NABZ0005', 'DEBIT',    1549, 'Netflix',                                 25, 1260, NULL),
  ('AZ21NABZ0005', 'DEBIT',    2000, 'Steam',                                    9, 1320, NULL),
  ('AZ21NABZ0006', 'CREDIT', 1000000, 'Açılış balansı',                        480, 540,  NULL),
  ('AZ21NABZ0006', 'DEBIT',   25000, 'Server hostinq',                          14, 660,  NULL)
)
INSERT INTO transactions (account_id, type, amount_minor, currency, description, transfer_id, created_at)
SELECT tx.account_id, tx.type, tx.amount_minor, a.currency, tx.description, tx.transfer_id,
       seed_ts('day', ('-' || tx.days_ago || ' days')::interval + ('+' || tx.minute_of_day || ' minutes')::interval)
FROM tx JOIN accounts a ON a.id = tx.account_id
ORDER BY tx.days_ago DESC, tx.minute_of_day, tx.account_id;

-- Depozit (API v2): student-in 40 gün əvvəl açdığı 6 aylıq AZN depoziti; vəsait AZ21NABZ0001-dən çıxılıb (DEBIT, deposit_id ilə)
INSERT INTO deposits (id, owner_id, source_account_id, currency, principal_minor, term_months, annual_rate, interest_payout, auto_renew, status, opened_at, maturity_date)
VALUES ('dep_5f2a9c1e7b30', 1, 'AZ21NABZ0001', 'AZN', 50000, 6, 8.00, 'AT_MATURITY', false, 'ACTIVE',
        seed_ts('day', ('-40 days')::interval + ('+10 hours')::interval), seed_date('day', ('-40 days')::interval + ('+6 months')::interval));
INSERT INTO transactions (account_id, type, amount_minor, currency, description, deposit_id, created_at)
VALUES ('AZ21NABZ0001', 'DEBIT', 50000, 'AZN', 'Depozit açılışı: dep_5f2a9c1e7b30 (6 ay, 8%)', 'dep_5f2a9c1e7b30',
        seed_ts('day', ('-40 days')::interval + ('+10 hours')::interval));

-- Balans = CREDIT-lərin cəmi − DEBIT-lərin cəmi (hesablar əməliyyatlarla həmişə uzlaşır).
UPDATE accounts
SET balance_minor = (
  SELECT COALESCE(SUM(CASE t.type WHEN 'CREDIT' THEN t.amount_minor ELSE -t.amount_minor END), 0)
  FROM transactions t WHERE t.account_id = accounts.id
);
