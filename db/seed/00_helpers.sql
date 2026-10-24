-- 00_helpers.sql — seed üçün tarix köməkçiləri: bütün vaxtlar bu günə NİSBƏTƏN (seed hər gün "təzə" görünür).
--   seed_ts('day', '-400 days'::interval + '9 hours'::interval) → bu günün 00:00 UTC-si − 400 gün + 9 saat → '2025-09-09T09:00:00Z'
--   seed_date('month', '3 years'::interval - '1 day'::interval) → ayın 1-i + 3 il − 1 gün → '2029-09-30'
-- base: 'now' (indiki an), 'day' (bu gün 00:00 UTC), 'month' (ayın 1-i 00:00 UTC)
CREATE OR REPLACE FUNCTION seed_base(base TEXT) RETURNS timestamp LANGUAGE sql STABLE AS $$
  SELECT CASE base
    WHEN 'day'   THEN date_trunc('day', now() AT TIME ZONE 'UTC')
    WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE 'UTC')
    ELSE date_trunc('second', now() AT TIME ZONE 'UTC') END
$$;
CREATE OR REPLACE FUNCTION seed_ts(base TEXT, shift INTERVAL) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT to_char(seed_base(base) + shift, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;
CREATE OR REPLACE FUNCTION seed_date(base TEXT, shift INTERVAL) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT to_char(seed_base(base) + shift, 'YYYY-MM-DD')
$$;
