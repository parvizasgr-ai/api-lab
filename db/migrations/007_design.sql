-- 007_design.sql — Design bölməsi (Google Stitch): dizayn sessiyaları və generasiya işləri.
--   * design_sessions — tələbənin hər "dizayn söhbəti" ayrıca Stitch project-dir (stitch_project_id)
--   * design_jobs — hər mesaj bir iş (GENERATE — ilk ekran, EDIT — redaktə). Generasiya dəqiqələrlə çəkir:
--     API 202 qaytarır, iş arxa planda icra olunur, portal GET /design/jobs/{id} ilə status soruşur (polling).
--   * Günlük kredit sayğacı = design_jobs.credits cəmi, usage_day (UTC tarixi) üzrə. Ayrıca "sıfırlama" cron-u lazım deyil:
--     UTC 00:00-da (Bakı 04:00) yeni gün başlayır, sayğac avtomatik yeni günə keçir. Stitch-in günlük hovuzu bütün
--     istifadəçilər üçün ortaqdır — limit yoxlaması və iş yaradılması eyni .immediate() tranzaksiyasındadır (yarış yoxdur).

CREATE TABLE design_sessions (
  id                TEXT    PRIMARY KEY,                          -- ds_ + 16 hex
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  stitch_project_id TEXT,                                         -- Stitch-də yaradılandan sonra yazılır
  current_screen_id TEXT,                                         -- son uğurlu ekran (EDIT bunu redaktə edir)
  device_type       TEXT    NOT NULL DEFAULT 'MOBILE' CHECK (device_type IN ('MOBILE', 'DESKTOP', 'TABLET')),
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);
CREATE INDEX design_sessions_user_idx ON design_sessions (user_id, updated_at DESC);

CREATE TABLE design_jobs (
  id            TEXT    PRIMARY KEY,                              -- dj_ + 16 hex
  session_id    TEXT    NOT NULL REFERENCES design_sessions(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('GENERATE', 'EDIT')),
  prompt        TEXT    NOT NULL CHECK (length(prompt) BETWEEN 1 AND 2000),
  device_type   TEXT    NOT NULL CHECK (device_type IN ('MOBILE', 'DESKTOP', 'TABLET')),
  status        TEXT    NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  usage_day     TEXT    NOT NULL,                                 -- YYYY-MM-DD (UTC) — günlük sayğac
  credits       INTEGER NOT NULL CHECK (credits >= 0),            -- təxmini kredit (Stitch-ə çatmayan xətada 0-a endirilir)
  complexity    TEXT    NOT NULL CHECK (complexity IN ('SIMPLE', 'COMPLEX')),
  screen_id     TEXT,
  html          TEXT,                                             -- sanitize edilmiş HTML
  message       TEXT,                                             -- Stitch-in mətn cavabı (output_components)
  error_code    TEXT,
  error_message TEXT,
  created_at    TEXT    NOT NULL,
  started_at    TEXT,
  finished_at   TEXT,
  CHECK ((status = 'SUCCEEDED') = (html IS NOT NULL))
);
CREATE INDEX design_jobs_day_idx ON design_jobs (usage_day, user_id);
CREATE INDEX design_jobs_session_idx ON design_jobs (session_id, created_at);
-- Bir sessiyada eyni anda yalnız bir aktiv iş (DB səviyyəsində zəmanət)
CREATE UNIQUE INDEX design_jobs_one_active ON design_jobs (session_id) WHERE status IN ('QUEUED', 'RUNNING');
