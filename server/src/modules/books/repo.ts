// Kitab repo — offset və keyset (cursor) pagination, rəylər.
import type { DB } from '../../db.js';

export interface BookRow {
  id: number;
  title: string;
  author: string;
  genre: string;
  year: number | null;
  description: string;
  rating: number;
  pages: number;
}

export interface BookFilter {
  q?: string;
  author?: string;
  genre?: string;
  year?: number;
}

function where(f: BookFilter) {
  return {
    sql: `WHERE (@q::text IS NULL OR title ILIKE @q OR author ILIKE @q OR description ILIKE @q)
            AND (@author::text IS NULL OR author ILIKE @author)
            AND (@genre::text IS NULL OR genre = @genre)
            AND (@year::int IS NULL OR year = @year)`,
    params: { q: f.q ? `%${f.q}%` : null, author: f.author ? `%${f.author}%` : null, genre: f.genre ?? null, year: f.year ?? null },
  };
}

export const booksRepo = {
  async count(db: DB, f: BookFilter) {
    const w = where(f);
    return (await db.prepare(`SELECT COUNT(*) FROM books ${w.sql}`).pluck().get(w.params)) as number;
  },

  async search(db: DB, f: BookFilter, orderBy: string, limit: number, offset: number) {
    const w = where(f);
    return (await db.prepare(`SELECT * FROM books ${w.sql} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`).all({ ...w.params, limit, offset })) as BookRow[];
  },

  // Keyset pagination: "id > son görülən id" — OFFSET-dən fərqli olaraq böyük cədvəldə də sürətlidir və səhifələr sürüşmür.
  afterId: async (db: DB, afterId: number, limit: number) =>
    (await db.prepare(`SELECT * FROM books WHERE id > ? ORDER BY id LIMIT ?`).all(afterId, limit)) as BookRow[],

  get: async (db: DB, id: number) => (await db.prepare(`SELECT * FROM books WHERE id = ?`).get(id)) as BookRow | undefined,

  reviews: async (db: DB, bookId: number) =>
    (await db
            .prepare(
              `SELECT r.id, r.book_id, u.username AS author, r.rating, r.comment, r.created_at
         FROM book_reviews r JOIN users u ON u.id = r.user_id
         WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC`,
            )
            .all(bookId)) as { id: number; book_id: number; author: string; rating: number; comment: string | null; created_at: string }[],

  averageRating: async (db: DB, bookId: number) =>
    (await db.prepare(`SELECT ROUND(AVG(rating)::numeric, 2) FROM book_reviews WHERE book_id = ?`).pluck().get(bookId)) as number | null,

  insertReview: async (db: DB, r: { book_id: number; user_id: number; rating: number; comment: string | null; created_at: string }) =>
    Number(
      (await db
                .prepare(`INSERT INTO book_reviews (book_id, user_id, rating, comment, created_at) VALUES (@book_id, @user_id, @rating, @comment, @created_at)`)
                .run(r)).lastInsertRowid,
    ),
};
