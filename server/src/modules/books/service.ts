// Kitablar: offset pagination (page/size) və cursor pagination (nextCursor) müqayisəsi.
import type { DB } from '../../db.js';
import type { Config } from '../../config.js';
import { conflict, notFound, unprocessable } from '../../errors.js';
import { isoNow } from '../../lib/crypto.js';
import { orderBy, offsetOf, pageOf } from '../../lib/listing.js';
import { booksRepo, type BookRow } from './repo.js';

// Cursor "opaque"-dur: client onun içini bilməməlidir. Biz sadəcə base64url("id:<son id>") istifadə edirik.
const encodeCursor = (id: number) => Buffer.from(`id:${id}`).toString('base64url');
function decodeCursor(cursor: string): number {
  const m = /^id:(\d+)$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!m) throw unprocessable('INVALID_CURSOR', 'Cursor etibarsızdır');
  return Number(m[1]);
}

const SORT = { title: 'title', year: 'year', rating: 'rating' };

export const toBook = (b: BookRow) => ({ ...b });

export class BooksService {
  constructor(
    private db: DB,
    private config: Config,
  ) {}

  async cursorPage(cursor: string | undefined, limit: number) {
    const after = cursor ? decodeCursor(cursor) : 0;
    const rows = await booksRepo.afterId(this.db, after, limit + 1); // +1 — növbəti səhifə varmı?
    const items = rows.slice(0, limit);
    return { items: items.map(toBook), limit, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1].id) : null };
  }

  async search(q: { q?: string; author?: string; genre?: string; year?: number; sort: string; page: number; size: number }) {
    const filter = { q: q.q, author: q.author, genre: q.genre, year: q.year };
    const total = await booksRepo.count(this.db, filter);
    const rows = await booksRepo.search(this.db, filter, orderBy(q.sort, SORT), q.size, offsetOf(q.page, q.size));
    return pageOf(rows.map(toBook), q.page, q.size, total);
  }

  async get(id: number) {
    const b = await booksRepo.get(this.db, id);
    if (!b) throw notFound('BOOK_NOT_FOUND', 'Kitab tapılmadı');
    return b;
  }

  async reviews(bookId: number) {
    await this.get(bookId);
    return {
      items: (await booksRepo.reviews(this.db, bookId)).map((r) => ({ id: r.id, bookId: r.book_id, author: r.author, rating: r.rating, comment: r.comment, createdAt: r.created_at })),
      averageRating: await booksRepo.averageRating(this.db, bookId),
    };
  }

  async addReview(userId: number, username: string, bookId: number, body: { rating: number; comment?: string }) {
    await this.get(bookId);
    const createdAt = isoNow(this.config.now());
    try {
      const id = await booksRepo.insertReview(this.db, { book_id: bookId, user_id: userId, rating: body.rating, comment: body.comment ?? null, created_at: createdAt });
      return { id, bookId, author: username, rating: body.rating, comment: body.comment ?? null, createdAt };
    } catch (err) {
      // UNIQUE (book_id, user_id) — "bir istifadəçi, bir rəy" qaydasını DB qoruyur
      if ((err as { code?: string }).code === '23505') throw conflict('REVIEW_EXISTS', 'Bu kitaba artıq rəy yazmısınız');
      throw err;
    }
  }
}
