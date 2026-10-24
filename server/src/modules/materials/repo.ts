// Materials repo — metadata və səhifələr.
import type { DB } from '../../db.js';

export type MaterialStatus = 'UPLOADED' | 'CONVERTING' | 'READY' | 'READY_NO_PREVIEW' | 'FAILED';
export type MaterialKind = 'SLIDES' | 'DOCUMENT' | 'TASKSHEET' | 'OTHER';

export interface MaterialRow {
  id: number;
  lesson: number | null;
  title: string;
  description: string | null;
  kind: MaterialKind;
  original_filename: string;
  stored_name: string;
  mime: string;
  size_bytes: number;
  page_count: number | null;
  status: MaterialStatus;
  error_message: string | null;
  uploaded_by: number | null;
  uploaded_by_username: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT m.*, u.username AS uploaded_by_username FROM materials m LEFT JOIN users u ON u.id = m.uploaded_by`;

export const materialsRepo = {
  list: async (db: DB, f: { lesson?: number; kind?: string; q?: string; readyOnly: boolean }) =>
    (await db
              .prepare(
                `${SELECT}
         WHERE (@lesson::int IS NULL OR m.lesson = @lesson)
           AND (@kind::text IS NULL OR m.kind = @kind)
           AND (@q::text IS NULL OR m.title ILIKE @q OR m.description ILIKE @q OR m.original_filename ILIKE @q)
           AND (@readyOnly = 0 OR m.status IN ('READY', 'READY_NO_PREVIEW'))
         ORDER BY m.lesson IS NULL, m.lesson, m.sort_order, m.id`,
              )
              .all({ lesson: f.lesson ?? null, kind: f.kind ?? null, q: f.q ? `%${f.q}%` : null, readyOnly: f.readyOnly ? 1 : 0 })) as MaterialRow[],

  get: async (db: DB, id: number) => (await db.prepare(`${SELECT} WHERE m.id = ?`).get(id)) as MaterialRow | undefined,

  findByOriginalName: async (db: DB, name: string) => (await db.prepare(`SELECT id FROM materials WHERE original_filename = ?`).get(name)) as { id: number } | undefined,

  byStatus: async (db: DB, statuses: MaterialStatus[]) =>
    (await db.prepare(`SELECT id FROM materials WHERE status = ANY(?::text[]) ORDER BY id`).pluck().all([statuses])) as number[],

  insert: async (db: DB, m: Omit<MaterialRow, 'id' | 'page_count' | 'status' | 'error_message' | 'uploaded_by_username' | 'updated_at'>) =>
    Number(
      (await db
                .prepare(
                  `INSERT INTO materials (lesson, title, description, kind, original_filename, stored_name, mime, size_bytes, status, uploaded_by, sort_order, created_at, updated_at)
           VALUES (@lesson, @title, @description, @kind, @original_filename, @stored_name, @mime, @size_bytes, 'UPLOADED', @uploaded_by, @sort_order, @created_at, @created_at)`,
                )
                .run(m)).lastInsertRowid,
    ),

  update: (db: DB, id: number, fields: { title: string; description: string | null; lesson: number | null; kind: string; sort_order: number; at: string }) =>
    db
      .prepare(`UPDATE materials SET title = @title, description = @description, lesson = @lesson, kind = @kind, sort_order = @sort_order, updated_at = @at WHERE id = @id`)
      .run({ ...fields, id }),

  setStatus: (db: DB, id: number, status: MaterialStatus, at: string, extra: { error?: string | null; pageCount?: number | null } = {}) =>
    db
      .prepare(`UPDATE materials SET status = ?, error_message = ?, page_count = ?, updated_at = ? WHERE id = ?`)
      .run(status, extra.error ?? null, extra.pageCount ?? null, at, id),

  delete: (db: DB, id: number) => db.prepare(`DELETE FROM materials WHERE id = ?`).run(id),

  pages: async (db: DB, id: number) =>
    (await db.prepare(`SELECT page_no, image_name, thumb_name FROM material_pages WHERE material_id = ? ORDER BY page_no`).all(id)) as {
      page_no: number;
      image_name: string;
      thumb_name: string;
    }[],

  page: async (db: DB, id: number, pageNo: number) =>
    (await db.prepare(`SELECT image_name, thumb_name FROM material_pages WHERE material_id = ? AND page_no = ?`).get(id, pageNo)) as
      Promise<| { image_name: string; thumb_name: string }>
      | undefined,

  replacePages: async (db: DB, id: number, pages: { page_no: number; image_name: string; thumb_name: string }[]) => {
    await db.prepare(`DELETE FROM material_pages WHERE material_id = ?`).run(id);
    const insert = db.prepare(`INSERT INTO material_pages (material_id, page_no, image_name, thumb_name) VALUES (?, ?, ?, ?)`);
    for (const p of pages) await insert.run(id, p.page_no, p.image_name, p.thumb_name);
  },

  linkTasks: async (db: DB, materialId: number, lesson: number) =>
    (await db.prepare(`UPDATE tasks SET material_id = ? WHERE lesson = ? AND material_id IS NULL`).run(materialId, lesson)).changes,
};
