-- 004_refresh_token_scope.sql — refresh token öz scope-unu saxlayır.
-- Səbəb: OAuth ilə məhdud scope verilmiş token refresh olunanda istifadəçinin BÜTÜN scope-larını almamalıdır
-- (scope escalation). NULL = parol ilə login (istifadəçinin cari scope-ları).
ALTER TABLE refresh_tokens ADD COLUMN scope TEXT;
