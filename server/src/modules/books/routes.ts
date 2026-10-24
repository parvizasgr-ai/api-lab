// Kitab endpoint-ləri (oxuma — X-API-Key, rəy yazmaq — Bearer).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { BooksService } from './service.js';

export function booksHandlers({ db, config }: AppContext): Handlers {
  const books = new BooksService(db, config);
  return {
    listBooksCursor: async (req, res) => res.json(await books.cursorPage(req.valid.query.cursor, req.valid.query.limit)),
    searchBooks: async (req, res) => res.json(await books.search(req.valid.query as any)),
    getBook: async (req, res) => res.json(await books.get(req.valid.params.bookId)),
    listBookReviews: async (req, res) => res.json(await books.reviews(req.valid.params.bookId)),
    createBookReview: async (req, res) => {
      const review = await books.addReview(req.auth!.userId, req.auth!.username, req.valid.params.bookId, req.valid.body);
      res.status(201).location(`/api/v1/books/${review.bookId}/reviews`).json(review);
    },
  };
}
