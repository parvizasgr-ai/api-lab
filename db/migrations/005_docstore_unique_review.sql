-- 005_docstore_unique_review.sql — "bir istifadəçi bir otelə 1 rəy" qaydasının əsl zəmanəti.
--   API əvvəlcə findOne ilə yoxlayır (aydın 409 mesajı üçün), amma iki paralel POST eyni anda yoxlamadan keçə bilər.
--   Bu unikal indeks ikincini DB səviyyəsində rədd edir (23505 → 409 REVIEW_EXISTS). Import edilən rəylərdə userId yoxdur — onlara aid deyil.

CREATE UNIQUE INDEX uq_docstore_hotel_review_user
  ON docstore.documents ((doc->'hotel'->>'id'), (doc->>'userId'))
  WHERE collection = 'hotel_reviews' AND doc ? 'userId';
