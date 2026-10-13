-- 003_materials_tasks.sql — dərs materialları (PDF/PPTX/DOCX/MD), onların səhifə şəkilləri, tapşırıqlar və irəliləyiş.
-- Fayllar DB-də yox, diskdə saxlanılır (data/materials/, web root-un xaricində); DB-də yalnız metadata.

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
CREATE INDEX idx_materials_lesson ON materials(lesson, sort_order);
CREATE INDEX idx_materials_status ON materials(status);

CREATE TABLE material_pages (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  page_no     INTEGER NOT NULL CHECK (page_no >= 1),
  image_name  TEXT    NOT NULL,                                    -- 1600px eni
  thumb_name  TEXT    NOT NULL,                                    -- 320px eni
  PRIMARY KEY (material_id, page_no)
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
CREATE INDEX idx_tasks_lesson ON tasks(lesson, sort_order);
CREATE INDEX idx_tasks_material ON tasks(material_id);

CREATE TABLE task_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  done_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, task_id)
);
CREATE INDEX idx_task_progress_task ON task_progress(task_id);

-- Materiallar: səhifə sayı, yükləyən, əlaqəli tapşırıqlar və neçə tələbənin onları bitirdiyi
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
