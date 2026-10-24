// Kitab: offset vs cursor pagination, axtarış, rəylər (UNIQUE → 409).
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

const KEY = { 'X-API-Key': 'apilab-demo-key-2026' };

describe('books', () => {
  const t = createTestApp();

  it('cursor pagination: 40 kitab, limit=15 → 3 səhifə, təkrarsız, son səhifədə nextCursor=null', async () => {
    const seen: number[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const res = await t.api().get('/api/v1/books').query({ limit: 15, ...(cursor ? { cursor } : {}) }).set(KEY);
      expect(res.status).toBe(200);
      expectMatchesSpec(res, 'listBooksCursor');
      seen.push(...res.body.items.map((b: { id: number }) => b.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('cursor: etibarsız → 422 INVALID_CURSOR; limit > 100 → 422; API key-siz → 401', async () => {
    const bad = await t.api().get('/api/v1/books?cursor=bm9wZQ').set(KEY);
    expect(bad.status).toBe(422);
    expectMatchesSpec(bad, 'listBooksCursor');
    expect(bad.body.code).toBe('INVALID_CURSOR');
    expect((await t.api().get('/api/v1/books?limit=101').set(KEY)).status).toBe(422);
    expect((await t.api().get('/api/v1/books')).status).toBe(401);
  });

  it('search: q, genre, sort, offset pagination', async () => {
    const nizami = await t.api().get('/api/v1/books/search?q=Nizami').set(KEY);
    expect(nizami.status).toBe(200);
    expectMatchesSpec(nizami, 'searchBooks');
    expect(nizami.body.total).toBe(3);
    const tech = await t.api().get('/api/v1/books/search').query({ genre: 'Texnologiya', sort: '-year', size: 2 }).set(KEY);
    expect(tech.body).toMatchObject({ total: 6, totalPages: 3 });
    expect(tech.body.items.map((b: { year: number }) => b.year)).toEqual([2018, 2017]);
    const book = await t.api().get('/api/v1/books/12').set(KEY);
    expectMatchesSpec(book, 'getBook');
    expect(book.body.title).toBe('Əli və Nino');
    expect((await t.api().get('/api/v1/books/999').set(KEY)).body.code).toBe('BOOK_NOT_FOUND');
  });

  it('rəylər: siyahı + orta bal; yazmaq 201, təkrar 409, bal 6 → 422, tokensiz 401, olmayan kitab 404', async () => {
    const list = await t.api().get('/api/v1/books/12/reviews').set(KEY);
    expectMatchesSpec(list, 'listBookReviews');
    expect(list.body.averageRating).toBe(4.5);

    const { access_token } = await t.login();
    const res = await t.api().post('/api/v1/books/1/reviews').set(bearer(access_token)).send({ rating: 5, comment: 'Mütləq oxuyun!' });
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createBookReview');
    expect(res.body).toMatchObject({ bookId: 1, author: 'student', rating: 5 });

    const dup = await t.api().post('/api/v1/books/1/reviews').set(bearer(access_token)).send({ rating: 4 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('REVIEW_EXISTS');
    expect((await t.api().post('/api/v1/books/2/reviews').set(bearer(access_token)).send({ rating: 6 })).status).toBe(422);
    expect((await t.api().post('/api/v1/books/2/reviews').send({ rating: 4 })).status).toBe(401);
    expect((await t.api().post('/api/v1/books/999/reviews').set(bearer(access_token)).send({ rating: 4 })).status).toBe(404);
    expect(await t.db.prepare(`SELECT COUNT(*) FROM book_reviews`).pluck().get()).toBe(11);
  });
});
