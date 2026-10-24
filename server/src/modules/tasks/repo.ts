// Tasks repo — tapşırıqlar və istifadəçi irəliləyişi.
import type { DB } from '../../db.js';

export interface TaskRow {
  id: number;
  lesson: number;
  title: string;
  description_md: string;
  method: string;
  path: string;
  expected_status: number;
  sql_check: string | null;
  material_id: number | null;
  sort_order: number;
  done_at: string | null; // cari istifadəçi üçün (LEFT JOIN)
}

export type TaskFields = Omit<TaskRow, 'id' | 'done_at'>;

// task_progress-i yalnız CARİ istifadəçiyə görə birləşdiririk — hər tələbə öz irəliləyişini görür
const SELECT = `SELECT t.*, tp.done_at FROM tasks t LEFT JOIN task_progress tp ON tp.task_id = t.id AND tp.user_id = @userId`;

export const tasksRepo = {
  list: async (db: DB, userId: number, lesson?: number) =>
    (await db.prepare(`${SELECT} WHERE @lesson::int IS NULL OR t.lesson = @lesson ORDER BY t.lesson, t.sort_order, t.id`).all({ userId, lesson: lesson ?? null })) as TaskRow[],

  get: async (db: DB, userId: number, id: number) => (await db.prepare(`${SELECT} WHERE t.id = @id`).get({ userId, id })) as TaskRow | undefined,

  findByTitle: async (db: DB, lesson: number, title: string) =>
    (await db.prepare(`SELECT id FROM tasks WHERE lesson = ? AND title = ?`).get(lesson, title)) as { id: number } | undefined,

  insert: async (db: DB, t: TaskFields & { at: string }) =>
    Number(
      (await db
                .prepare(
                  `INSERT INTO tasks (lesson, title, description_md, method, path, expected_status, sql_check, material_id, sort_order, created_at, updated_at)
           VALUES (@lesson, @title, @description_md, @method, @path, @expected_status, @sql_check, @material_id, @sort_order, @at, @at)`,
                )
                .run(t)).lastInsertRowid,
    ),

  update: (db: DB, id: number, t: TaskFields & { at: string }) =>
    db
      .prepare(
        `UPDATE tasks SET lesson = @lesson, title = @title, description_md = @description_md, method = @method, path = @path,
                expected_status = @expected_status, sql_check = @sql_check, material_id = @material_id, sort_order = @sort_order, updated_at = @at
         WHERE id = @id`,
      )
      .run({ ...t, id }),

  delete: async (db: DB, id: number) => (await db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)).changes,

  // INSERT OR IGNORE — ikinci "done" ilk tamamlama vaxtını dəyişmir (PUT idempotentdir)
  markDone: (db: DB, userId: number, taskId: number, at: string) =>
    db.prepare(`INSERT INTO task_progress (user_id, task_id, done_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`).run(userId, taskId, at),

  markUndone: (db: DB, userId: number, taskId: number) => db.prepare(`DELETE FROM task_progress WHERE user_id = ? AND task_id = ?`).run(userId, taskId),

  summary: async (db: DB, userId: number) =>
    (await db
            .prepare(
              `SELECT t.lesson, COUNT(*) AS total, COUNT(tp.task_id) AS done
         FROM tasks t LEFT JOIN task_progress tp ON tp.task_id = t.id AND tp.user_id = ?
         GROUP BY t.lesson ORDER BY t.lesson`,
            )
            .all(userId)) as { lesson: number; total: number; done: number }[],

  materialExists: async (db: DB, id: number) => !!(await db.prepare(`SELECT 1 FROM materials WHERE id = ?`).get(id)),
};
