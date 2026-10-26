// Otel rəyləri — MongoDB (sənəd bazası) nümunəsi. Kitab rəyləri isə PostgreSQL cədvəlindədir (book_reviews):
// tələbə eyni "rəy" anlayışının relational (sətir + FK + JOIN) və document (iç-içə obyekt, massiv, sxemsiz) modelini müqayisə edir.
// Yazılan rəy Kafka-ya "review.created" hadisəsi göndərir.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { conflict, notFound } from '../../errors.js';
import { COLLECTIONS, TOPICS } from '../../infra/index.js';
import { shellJson, type Doc } from '../../infra/mongo.js';

const SORTS: Record<string, Record<string, 1 | -1>> = {
  '-createdAt': { createdAt: -1 },
  createdAt: { createdAt: 1 },
  '-rating': { rating: -1, createdAt: -1 },
  rating: { rating: 1, createdAt: -1 },
  '-helpfulVotes': { helpfulVotes: -1, createdAt: -1 },
};

interface ReviewInput {
  rating: number;
  title?: string;
  text: string;
  stay?: { month: string; tripType: string };
  pros?: string[];
  cons?: string[];
}

export function hotelReviewsHandlers({ db, infra, config }: AppContext): Handlers {
  const hotelOf = async (hotelId: number) => {
    const hotel = (await db.prepare(`SELECT id, name, city FROM hotels WHERE id = ?`).get(hotelId)) as { id: number; name: string; city: string } | undefined;
    if (!hotel) throw notFound('HOTEL_NOT_FOUND', 'Otel tapılmadı');
    return hotel;
  };

  return {
    listHotelReviews: async (req, res) => {
      const hotelId = req.valid.params.hotelId as number;
      const { sort, minRating } = req.valid.query as { sort: string; minRating?: number };
      await hotelOf(hotelId);
      const filter: Record<string, unknown> = { 'hotel.id': hotelId, ...(minRating ? { rating: { $gte: minRating } } : {}) };
      const items = (await infra.mongo.find(COLLECTIONS.hotelReviews, filter, { sort: SORTS[sort] })) as Doc[];
      const all = (await infra.mongo.find(COLLECTIONS.hotelReviews, { 'hotel.id': hotelId })) as Doc[];
      const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((r) => [String(r), all.filter((d) => d.rating === r).length]));
      const avg = all.length ? Math.round((all.reduce((n, d) => n + (d.rating as number), 0) / all.length) * 10) / 10 : null;
      res.json({
        items,
        total: items.length,
        averageRating: avg,
        ratingDistribution: distribution,
        storage: 'mongodb',
        query: `db.${COLLECTIONS.hotelReviews}.find(${shellJson(filter)}).sort(${shellJson(SORTS[sort])})`,
      });
    },

    createHotelReview: async (req, res) => {
      const hotelId = req.valid.params.hotelId as number;
      const body = req.valid.body as ReviewInput;
      const hotel = await hotelOf(hotelId);
      const auth = req.auth!;
      if (await infra.mongo.findOne(COLLECTIONS.hotelReviews, { 'hotel.id': hotelId, userId: auth.userId })) {
        throw conflict('REVIEW_EXISTS', 'Bu otelə artıq rəy yazmısınız');
      }
      const user = (await db.prepare(`SELECT full_name FROM users WHERE id = ?`).pluck().get(auth.userId)) as string;
      const doc = await infra.mongo.insertOne(COLLECTIONS.hotelReviews, {
        hotel,
        user: { id: auth.userId, username: auth.username, name: user },
        userId: auth.userId,
        rating: body.rating,
        ...(body.title ? { title: body.title.trim() } : {}),
        text: body.text.trim(),
        ...(body.stay ? { stay: body.stay } : {}),
        ...(body.pros?.length ? { pros: body.pros } : {}),
        ...(body.cons?.length ? { cons: body.cons } : {}),
        helpfulVotes: 0,
        createdAt: config.now().toISOString(),
      }).catch((err: { code?: string }) => {
        // Paralel ikinci sorğu yuxarıdakı yoxlamadan keçibsə — unikal indeks (005) rədd edir
        if (err.code === '23505') throw conflict('REVIEW_EXISTS', 'Bu otelə artıq rəy yazmısınız');
        throw err;
      });
      infra.publish(TOPICS.reviews, 'review.created', auth.userId, { reviewId: doc._id, hotelId, rating: body.rating });
      res.status(201).location(`/api/v1/hotels/${hotelId}/reviews`).json(doc);
    },
  };
}
