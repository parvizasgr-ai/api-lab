-- 06_documents.sql — MongoDB (docstore) seed: otel rəyləri. Sənədlərin forması qəsdən fərqlidir (schema-less):
--   * API ilə yazılan rəy: user {id, username, name}, stay {month, tripType}, pros[], cons[]
--   * tərəfdaşdan import edilən rəy: user yoxdur, source + reviewer, bəzilərində photos[]
-- notifications kolleksiyası boş başlayır — Kafka consumer-i (notification-service) doldurur.

INSERT INTO docstore.documents (collection, id, doc)
SELECT 'hotel_reviews', r.id, jsonb_strip_nulls(jsonb_build_object(
         '_id', r.id,
         'hotel', jsonb_build_object('id', h.id, 'name', h.name, 'city', h.city),
         'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id', u.id, 'username', u.username, 'name', u.full_name) END,
         'userId', u.id,
         'source', r.source,
         'reviewer', r.reviewer,
         'rating', r.rating,
         'title', r.title,
         'text', r.text,
         'stay', CASE WHEN r.trip IS NULL THEN NULL ELSE jsonb_build_object('month', substr(seed_date('month', r.stay), 1, 7), 'tripType', r.trip) END,
         'pros', r.pros,
         'cons', r.cons,
         'photos', r.photos,
         'helpfulVotes', r.votes,
         'createdAt', seed_ts('day', r.created)))
FROM (VALUES
  ('665a00000000000000000001', 1, 1, NULL, NULL, 5, 'Dəniz mənzərəsi möhtəşəmdir', 'Otaqdan Xəzər görünür, səhər yeməyi zəngindir.', 'COUPLE', '-2 months'::interval, '["mənzərə","səhər yeməyi","hovuz"]'::jsonb, '["baha parkinq"]'::jsonb, NULL::jsonb, 12, '-50 days'::interval),
  ('665a00000000000000000002', 1, 3, NULL, NULL, 4, 'Biznes səfər üçün rahat', 'Konfrans zalı və sürətli Wi-Fi var. Check-in bir az uzun çəkdi.', 'BUSINESS', '-1 month', '["Wi-Fi","konfrans zalı"]', '["check-in növbəsi"]', NULL, 4, '-25 days'),
  ('665a00000000000000000003', 1, NULL, 'booking-partner', 'Leyla K.', 5, NULL, 'Personal çox mehribandır, spa əla idi.', NULL, NULL, NULL, NULL, '["https://img.example/xs-1.jpg","https://img.example/xs-2.jpg"]', 7, '-80 days'),
  ('665a00000000000000000004', 2, 1, NULL, NULL, 5, 'İçərişəhərin qəlbində', 'Tarixi binada, hər yerə piyada getmək olur.', 'SOLO', '-3 months', '["mərkəz","atmosfer"]', '["lift yoxdur"]', NULL, 9, '-85 days'),
  ('665a00000000000000000005', 2, NULL, 'booking-partner', 'Tural M.', 4, NULL, 'Kiçik, amma çox təmiz və səliqəli.', NULL, NULL, NULL, NULL, NULL, 2, '-40 days'),
  ('665a00000000000000000006', 3, 3, NULL, NULL, 3, 'Mənzərə var, səs-küy də', 'Alov qüllələri gecə gözəl görünür, amma yol səs-küylüdür.', 'BUSINESS', '-2 months', '["mənzərə"]', '["səs-küy","kiçik otaq"]', NULL, 1, '-55 days'),
  ('665a00000000000000000007', 4, 1, NULL, NULL, 4, 'Qiymətinə görə əla', 'Parka baxır, metroya yaxındır.', 'FAMILY', '-4 months', '["metro","qiymət"]', '[]', NULL, 3, '-110 days'),
  ('665a00000000000000000008', 5, NULL, 'tripadvisor-import', 'Anna S.', 2, NULL, 'Room was small and the AC was noisy.', NULL, NULL, NULL, NULL, NULL, 0, '-30 days'),
  ('665a00000000000000000009', 6, 3, NULL, NULL, 4, 'Gəncədə ən yaxşı seçim', 'Səhər yeməyi yerli məhsullardandır, Nizami məqbərəsinə yaxındır.', 'FAMILY', '-1 month', '["səhər yeməyi","yer"]', '["köhnə mebel"]', NULL, 5, '-20 days'),
  ('665a00000000000000000010', 8, 1, NULL, NULL, 5, 'Dağ havası və xizək', 'Tufandağ kanat yoluna 5 dəqiqə. Uşaqlar üçün əyləncə var.', 'FAMILY', '-5 months', '["xizək","uşaq klubu","spa"]', '["restoran baha"]', '["https://img.example/qd-1.jpg"]', 15, '-140 days'),
  ('665a00000000000000000011', 8, NULL, 'booking-partner', 'Rəşad Ə.', 4, NULL, 'Qış mövsümündə çox dolu olur, əvvəlcədən bron edin.', NULL, NULL, NULL, NULL, NULL, 6, '-60 days'),
  ('665a00000000000000000012', 9, 3, NULL, NULL, 5, 'Nohur gölünün yanında', 'Sakit, təbiətin içində. Şəhərdən qaçmaq üçün ideal.', 'COUPLE', '-2 months', '["sakitlik","təbiət"]', '["mağaza uzaqdır"]', NULL, 8, '-45 days'),
  ('665a00000000000000000013', 10, 1, NULL, NULL, 5, 'Boğaz mənzərəli otaq', 'Terrasda səhər yeməyi və Boğaz — unudulmaz.', 'COUPLE', '-6 months', '["mənzərə","terras"]', '["baha"]', NULL, 11, '-170 days'),
  ('665a00000000000000000014', 11, NULL, 'tripadvisor-import', 'Mehmet Y.', 3, NULL, 'Konum çok iyi ama oda eski.', NULL, NULL, NULL, NULL, NULL, 1, '-35 days'),
  ('665a00000000000000000015', 13, 3, NULL, NULL, 4, 'Marina-ya baxan hovuz', 'Damdakı hovuz möhtəşəmdir, metro bir az uzaqdır.', 'BUSINESS', '-3 months', '["hovuz","mənzərə"]', '["metro uzaq"]', NULL, 4, '-75 days'),
  ('665a00000000000000000016', 15, 1, NULL, NULL, 4, 'Köhnə Tbilisi ruhu', 'Ev kimi rahat, sahibkar şərab dequstasiyası təşkil etdi.', 'SOLO', '-1 month', '["atmosfer","sahibkar"]', '["isti su gec gəlir"]', NULL, 6, '-15 days')
) AS r(id, hotel_id, user_id, source, reviewer, rating, title, text, trip, stay, pros, cons, photos, votes, created)
JOIN hotels h ON h.id = r.hotel_id
LEFT JOIN users u ON u.id = r.user_id;
