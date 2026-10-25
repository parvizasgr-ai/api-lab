-- 004_docstore.sql — MongoDB simulyasiyasının saxlama yeri (server/src/infra/mongo.ts).
--   Hər sənəd bir JSONB sətridir: collection + _id (ObjectId, 24 hex) → doc. Sorğu dili (find/aggregate) server tərəfində işləyir.
--   Ayrıca "docstore" sxemi: SQL Playground rolu (apilab_playground) buna giriş almır — tələbə bu datanı yalnız
--   Mongo sorğusu ilə görür (POST /api/v1/_mongo/query), SQL ilə yox. Relational (book_reviews) vs document (hotel_reviews) müqayisəsi üçün.

CREATE SCHEMA docstore;

CREATE TABLE docstore.documents (
  collection TEXT  NOT NULL CHECK (collection ~ '^[a-z][a-z0-9_]{1,40}$'),
  id         TEXT  NOT NULL CHECK (id ~ '^[0-9a-f]{24}$'),
  doc        JSONB NOT NULL CHECK (doc->>'_id' = id),
  PRIMARY KEY (collection, id)
);

-- Tez-tez axtarılan sahələr (Mongo-da createIndex kimi)
CREATE INDEX idx_docstore_user ON docstore.documents (collection, ((doc->>'userId')));
CREATE INDEX idx_docstore_hotel ON docstore.documents (collection, ((doc->'hotel'->>'id')));
