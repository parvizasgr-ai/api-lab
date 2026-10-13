// Kitab endpoint-ləri (oxuma — X-API-Key, rəy yazmaq — Bearer).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { BooksService } from './service.js';

export function booksHandlers({ db, config }: AppContext): Handlers {
  const books = new BooksService(db, config);
  return {
    listBooksCursor: (req, res) => res.json(books.cursorPage(req.valid.query.cursor, req.valid.query.limit)),
    searchBooks: (req, res) => res.json(books.search(req.valid.query as any)),
    getBook: (req, res) => res.json(books.get(req.valid.params.bookId)),
    listBookReviews: (req, res) => res.json(books.reviews(req.valid.params.bookId)),
    createBookReview: (req, res) => {
      const review = books.addReview(req.auth!.userId, req.auth!.username, req.valid.params.bookId, req.valid.body);
      res.status(201).location(`/api/v1/books/${review.bookId}/reviews`).json(review);
    },
  };
}
