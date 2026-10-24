-- 002_playground.sql — SQL Playground üçün təhlükəsizlik qatı (PostgreSQL rolları).
--   apilab_playground: ayrıca LOGIN rolu (npm run db:setup yaradır). Yazma hüququ YOXDUR.
--   Sirr sütunu olan cədvəllərə (password_hash və s.) birbaşa giriş yoxdur — yalnız lab sxemindəki maskalı view-lar:
--     SELECT * FROM users  →  lab.users (search_path = lab, public), password_hash = '[hidden#1]'
--   lab.refresh() view və grant-ları information_schema-dan yenidən qurur — cədvələ sütun əlavə olunanda da maska qalır
--   (migrate() hər migration-dan sonra çağırır).

CREATE SCHEMA lab;

CREATE TABLE lab.hidden_columns (
  table_name  TEXT NOT NULL,
  column_name TEXT NOT NULL,
  PRIMARY KEY (table_name, column_name)
);
INSERT INTO lab.hidden_columns VALUES
  ('users', 'password_hash'),
  ('refresh_tokens', 'token_hash'),
  ('api_keys', 'key_hash'),
  ('oauth_clients', 'client_secret_hash'),
  ('oauth_codes', 'code'); -- 60 saniyəlik birdəfəlik sirr

CREATE FUNCTION lab.refresh() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t record;
  cols text;
  playground boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apilab_playground');
BEGIN
  -- Maskalı view-lar: gizli sütun '[hidden#<id>]' (və ya id yoxdursa '[hidden]') ilə əvəzlənir
  FOR t IN SELECT DISTINCT table_name FROM lab.hidden_columns LOOP
    SELECT string_agg(
             CASE WHEN EXISTS (SELECT 1 FROM lab.hidden_columns h WHERE h.table_name = t.table_name AND h.column_name = c.column_name)
                  THEN CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns i
                                         WHERE i.table_schema = 'public' AND i.table_name = t.table_name AND i.column_name = 'id')
                            THEN format('(''[hidden#'' || id || '']'')::text AS %I', c.column_name)
                            ELSE format('''[hidden]''::text AS %I', c.column_name) END
                  ELSE format('%I', c.column_name) END,
             ', ' ORDER BY c.ordinal_position)
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = t.table_name;
    IF cols IS NOT NULL THEN
      EXECUTE format('DROP VIEW IF EXISTS lab.%I', t.table_name);
      EXECUTE format('CREATE VIEW lab.%I WITH (security_barrier) AS SELECT %s FROM public.%I', t.table_name, cols, t.table_name);
    END IF;
  END LOOP;

  IF playground THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public, lab TO apilab_playground';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO apilab_playground';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA lab TO apilab_playground';
    EXECUTE 'REVOKE SELECT ON lab.hidden_columns FROM apilab_playground';
    FOR t IN SELECT DISTINCT table_name FROM lab.hidden_columns LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM apilab_playground', t.table_name);
    END LOOP;
    -- Funksiyalar: yalnız oxuyan hesablama; lab.refresh() playground üçün deyil
    EXECUTE 'REVOKE ALL ON FUNCTION lab.refresh() FROM PUBLIC';
  END IF;
END $$;

SELECT lab.refresh();
