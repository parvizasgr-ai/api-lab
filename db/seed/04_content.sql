-- 04_content.sql — müştərilər (CRUD), kitablar, rəylər, musiqi

INSERT INTO customers (id, first_name, last_name, email, phone, city, active, created_at, updated_at)
SELECT id, first_name, last_name, email, phone, city, active,
       seed_ts('day', ('-' || (200 - id * 7) || ' days')::interval + ('+' || (540 + id * 13) || ' minutes')::interval),
       seed_ts('day', ('-' || (200 - id * 7) || ' days')::interval + ('+' || (540 + id * 13) || ' minutes')::interval)
FROM (
  SELECT 1 AS id, 'Nigar' AS first_name, 'Əliyeva' AS last_name, 'nigar.aliyeva@example.az' AS email, '+994501234501' AS phone, 'Bakı' AS city, 1 AS active
  UNION ALL SELECT  2, 'Tural',   'Quliyev',      'tural.quliyev@example.az',      '+994552345602', 'Bakı',       1
  UNION ALL SELECT  3, 'Leyla',   'Hüseynova',    'leyla.huseynova@example.az',    '+994703456703', 'Gəncə',      1
  UNION ALL SELECT  4, 'Elçin',   'Rzayev',       'elchin.rzayev@example.az',      '+994514567804', 'Sumqayıt',   1
  UNION ALL SELECT  5, 'Günay',   'İsmayılova',   'gunay.ismayilova@example.az',   '+994775678905', 'Bakı',       1
  UNION ALL SELECT  6, 'Orxan',   'Abbasov',      'orxan.abbasov@example.az',      '+994506789006', 'Lənkəran',   0
  UNION ALL SELECT  7, 'Sevinc',  'Kərimova',     'sevinc.kerimova@example.az',    '+994557890107', 'Şəki',       1
  UNION ALL SELECT  8, 'Kamran',  'Babayev',      'kamran.babayev@example.az',     '+994708901208', 'Bakı',       1
  UNION ALL SELECT  9, 'Aynur',   'Səfərova',     'aynur.seferova@example.az',     '+994519012309', 'Quba',       1
  UNION ALL SELECT 10, 'Fərid',   'Novruzov',     'farid.novruzov@example.az',     '+994770123410', 'Mingəçevir', 1
  UNION ALL SELECT 11, 'Ülviyyə', 'Cəfərova',     'ulviyye.cafarova@example.az',   '+994501234511', 'Bakı',       1
  UNION ALL SELECT 12, 'Rəşad',   'Məmmədli',     'reshad.memmedli@example.az',    '+994552345612', 'Gəncə',      0
  UNION ALL SELECT 13, 'Könül',   'Paşayeva',     'konul.pashayeva@example.az',    '+994703456713', 'Bakı',       1
  UNION ALL SELECT 14, 'Emil',    'Qasımov',      'emil.qasimov@example.az',       '+994514567814', 'Şamaxı',     1
  UNION ALL SELECT 15, 'Aytən',   'Vəliyeva',     'ayten.veliyeva@example.az',     '+994775678915', 'Naxçıvan',   1
  UNION ALL SELECT 16, 'Samir',   'Hacıyev',      'samir.haciyev@example.az',      '+994506789016', 'Bakı',       1
  UNION ALL SELECT 17, 'Lalə',    'Mustafayeva',  'lale.mustafayeva@example.az',   '+994557890117', 'Sumqayıt',   1
  UNION ALL SELECT 18, 'Vüsal',   'Orucov',       'vusal.orucov@example.az',       '+994708901218', 'Gəncə',      1
  UNION ALL SELECT 19, 'Nərmin',  'Allahverdiyeva','narmin.allahverdiyeva@example.az','+994519012319', 'Bakı',    1
  UNION ALL SELECT 20, 'Cavid',   'Süleymanov',   'cavid.suleymanov@example.az',   '+994770123420', 'Lənkəran',   1
  UNION ALL SELECT 21, 'Səbinə',  'Nəsirova',     'sabina.nasirova@example.az',    '+994501234521', 'Bakı',       0
  UNION ALL SELECT 22, 'Murad',   'Əsgərov',      'murad.asgarov@example.az',      '+994552345622', 'Şəki',       1
  UNION ALL SELECT 23, 'Xədicə',  'Rüstəmova',    'xadija.rustamova@example.az',   '+994703456723', 'Quba',       1
  UNION ALL SELECT 24, 'İlkin',   'Bağırov',      'ilkin.bagirov@example.az',      '+994514567824', 'Bakı',       1
  UNION ALL SELECT 25, 'Mehriban','Zeynalova',    'mehriban.zeynalova@example.az', '+994775678925', 'Mingəçevir', 1
) c
ORDER BY id;

INSERT INTO books (id, title, author, genre, year, description, rating, pages) VALUES
  ( 1, 'Kitabi-Dədə Qorqud',            'Anonim',                      'Dastan',      NULL, 'Oğuz türklərinin qəhrəmanlıq dastanları toplusu.', 4.8, 320),
  ( 2, 'Sirlər xəzinəsi',               'Nizami Gəncəvi',              'Poema',       1163, '"Xəmsə"nin ilk poeması — fəlsəfi-didaktik əsər.', 4.6, 240),
  ( 3, 'Xosrov və Şirin',               'Nizami Gəncəvi',              'Poema',       1180, 'Sasani şahı Xosrov və erməni şahzadəsi Şirinin məhəbbət dastanı.', 4.7, 410),
  ( 4, 'Yeddi gözəl',                   'Nizami Gəncəvi',              'Poema',       1197, 'Bəhram Gur və yeddi iqlimin yeddi gözəli haqqında.', 4.7, 380),
  ( 5, 'Leyli və Məcnun',               'Məhəmməd Füzuli',             'Poema',       1536, 'Şərq ədəbiyyatının ən məşhur məhəbbət poeması.', 4.9, 350),
  ( 6, 'Danabaş kəndinin əhvalatları',  'Cəlil Məmmədquluzadə',        'Povest',      1894, 'Kənd həyatının satirik təsviri.', 4.5, 120),
  ( 7, 'Ölülər',                        'Cəlil Məmmədquluzadə',        'Dram',        1909, 'Mövhumatı ifşa edən məşhur komediya.', 4.6, 96),
  ( 8, 'Şeyx Sənan',                    'Hüseyn Cavid',                'Dram',        1914, 'İnam, məhəbbət və azadlıq haqqında mənzum faciə.', 4.5, 180),
  ( 9, 'İblis',                         'Hüseyn Cavid',                'Dram',        1918, 'Birinci Dünya müharibəsi fonunda insan və şər.', 4.4, 160),
  (10, 'Sevil',                         'Cəfər Cabbarlı',              'Dram',        1928, 'Qadın azadlığı mövzusunda pyes.', 4.5, 110),
  (11, 'Od gəlini',                     'Cəfər Cabbarlı',              'Dram',        1928, 'Tarixi-romantik mənzum dram.', 4.3, 130),
  (12, 'Əli və Nino',                   'Qurban Səid',                 'Roman',       1937, 'Bakılı Əli xan və gürcü Ninonun sevgi hekayəsi.', 4.7, 288),
  (13, 'Vaqif',                         'Səməd Vurğun',                'Dram',        1937, 'Molla Pənah Vaqifin həyatından mənzum dram.', 4.4, 150),
  (14, 'Uzaq sahillərdə',               'İmran Qasımov, Həsən Seyidbəyli','Povest',   1954, 'Mehdi Hüseynzadənin (Mixaylo) qəhrəmanlığı.', 4.5, 230),
  (15, 'Dəli Kür',                      'İsmayıl Şıxlı',               'Roman',       1967, 'XIX əsr Azərbaycan kəndində Cahandar ağanın taleyi.', 4.8, 420),
  (16, 'Mahmud və Məryəm',              'Elçin',                       'Roman',       1983, 'Qarabağda keçən faciəvi məhəbbət romanı.', 4.6, 260),
  (17, 'Qətl günü',                     'Yusif Səmədoğlu',             'Roman',       1987, 'Tarix və müasirlik qovşağında fəlsəfi roman.', 4.6, 330),
  (18, '1984',                          'George Orwell',               'Fantastika',  1949, 'Total nəzarət cəmiyyəti haqqında distopiya.', 4.7, 328),
  (19, 'Kiçik şahzadə',                 'Antoine de Saint-Exupéry',    'Nağıl',       1943, 'Böyüklər üçün uşaq kitabı.', 4.8, 96),
  (20, 'Cinayət və cəza',               'Fyodor Dostoyevski',          'Roman',       1866, 'Raskolnikovun vicdan əzabı.', 4.7, 672),
  (21, 'Master və Marqarita',           'Mixail Bulqakov',             'Roman',       1967, 'Moskvada şeytanın səfəri və Pilatın hekayəsi.', 4.8, 480),
  (22, 'Yüz ilin tənhalığı',            'Gabriel García Márquez',      'Roman',       1967, 'Buendia nəslinin yeddi nəsillik tarixi.', 4.6, 417),
  (23, 'Simyaçı',                       'Paulo Coelho',                'Roman',       1988, 'Santiaqonun xəzinə axtarışı.', 4.2, 208),
  (24, 'Dune',                          'Frank Herbert',               'Fantastika',  1965, 'Arrakis səhra planetində güc mübarizəsi.', 4.6, 612),
  (25, 'Üzüklərin hökmdarı',            'J. R. R. Tolkien',            'Fantastika',  1954, 'Orta Dünyada Hökmdarlıq Üzüyünün məhvi.', 4.9, 1178),
  (26, 'Qürur və qərəz',                'Jane Austen',                 'Roman',       1813, 'Elizabet Bennet və mister Darsi.', 4.5, 432),
  (27, 'Böyük Qetsbi',                  'F. Scott Fitzgerald',         'Roman',       1925, 'Caz əsrində Amerika arzusu.', 4.3, 180),
  (28, 'Sapiens',                       'Yuval Noah Harari',           'Tarix',       2011, 'Bəşəriyyətin qısa tarixi.', 4.5, 498),
  (29, 'Thinking, Fast and Slow',       'Daniel Kahneman',             'Psixologiya', 2011, 'Sistem 1 və Sistem 2: qərar qəbulu psixologiyası.', 4.4, 499),
  (30, 'Atomic Habits',                 'James Clear',                 'Psixologiya', 2018, 'Kiçik vərdişlərlə böyük dəyişikliklər.', 4.6, 320),
  (31, 'The Lean Startup',              'Eric Ries',                   'Biznes',      2011, 'MVP, build-measure-learn dövrü.', 4.3, 336),
  (32, 'Clean Code',                    'Robert C. Martin',            'Texnologiya', 2008, 'Oxunaqlı və saxlanıla bilən kod yazmaq.', 4.4, 464),
  (33, 'The Pragmatic Programmer',      'Andrew Hunt, David Thomas',   'Texnologiya', 1999, 'Proqramçının peşəkar yol xəritəsi.', 4.6, 352),
  (34, 'Designing Data-Intensive Applications', 'Martin Kleppmann',    'Texnologiya', 2017, 'Paylanmış sistemlər, DB və stream emalı.', 4.8, 616),
  (35, 'Domain-Driven Design',          'Eric Evans',                  'Texnologiya', 2003, 'Mürəkkəb biznes domenlərinin modelləşdirilməsi.', 4.3, 560),
  (36, 'RESTful Web APIs',              'Leonard Richardson, Mike Amundsen', 'Texnologiya', 2013, 'Hypermedia və REST API dizaynı.', 4.1, 406),
  (37, 'Designing Web APIs',            'Brenda Jin, Saurabh Sahni, Amir Shevat', 'Texnologiya', 2018, 'Developer-friendly API dizayn prinsipləri.', 4.2, 232),
  (38, 'User Story Mapping',            'Jeff Patton',                 'Biznes',      2014, 'Məhsulu istifadəçi səyahəti ilə planlamaq.', 4.4, 324),
  (39, 'BABOK Guide v3',                'IIBA',                        'Biznes',      2015, 'Biznes analizi bilik toplusu.', 4.0, 514),
  (40, 'Zero to One',                   'Peter Thiel',                 'Biznes',      2014, 'Startaplar və gələcəyin qurulması haqqında qeydlər.', 4.2, 224);

INSERT INTO book_reviews (book_id, user_id, rating, comment, created_at) VALUES
  (12, 1, 5, 'Bakının XX əsr əvvəlindəki atmosferi çox canlıdır.',          seed_ts('day', ('-60 days')::interval + ('+20 hours')::interval)),
  (12, 3, 4, 'Gözəl roman, sonluğu kədərlidir.',                             seed_ts('day', ('-45 days')::interval + ('+21 hours')::interval)),
  (15, 1, 5, 'Cahandar ağa obrazı unudulmazdır.',                            seed_ts('day', ('-40 days')::interval + ('+19 hours')::interval)),
  (18, 3, 5, 'Bu gün də aktualdır.',                                         seed_ts('day', ('-30 days')::interval + ('+22 hours')::interval)),
  (34, 1, 5, 'Backend və arxitektura üçün mütləq oxunmalıdır.',              seed_ts('day', ('-25 days')::interval + ('+18 hours')::interval)),
  (34, 2, 4, 'Ağır, amma çox dəyərli.',                                      seed_ts('day', ('-20 days')::interval + ('+17 hours')::interval)),
  (36, 1, 4, 'REST-in nəzəri əsasları üçün yaxşıdır.',                       seed_ts('day', ('-15 days')::interval + ('+20 hours')::interval)),
  (39, 2, 3, 'Sertifikat üçün lazımdır, amma quru yazılıb.',                 seed_ts('day', ('-10 days')::interval + ('+12 hours')::interval)),
  (5,  3, 5, 'Füzulinin dili əvəzsizdir.',                                   seed_ts('day', ('-8 days')::interval + ('+21 hours')::interval)),
  (23, 1, 3, 'Motivasiyaedici, amma bir az sadədir.',                        seed_ts('day', ('-3 days')::interval + ('+22 hours')::interval));

-- YouTube ID-ləri oEmbed ilə yoxlanılıb (videolar mövcuddur). duration_sec təxminidir.
INSERT INTO tracks (id, youtube_id, title, artist, genre, duration_sec) VALUES
  ( 1, '_0tlQUW5X0U', 'Running Scared',              'Ell & Nikki',              'Pop',     183),
  ( 2, 'ipQswujA5gw', 'Start A Fire',                'Dilara Kazımova',          'Pop',     180),
  ( 3, 'D6vvuCiHwSs', 'Truth',                       'Chingiz',                  'Pop',     180),
  ( 4, 'I0VzBCvO1Wk', 'Cleopatra',                   'Efendi',                   'Pop',     184),
  ( 5, '9OEIOS1oUeY', 'Always',                      'Aysel & Arash',            'Pop',     180),
  ( 6, 'mbGfFlLYaSc', 'Segah',                       'Alim Qasımov',             'Muğam',   540),
  ( 7, 'f6NQrsKXyuU', 'Bakı, əziz şəhər',            'Rəşid Behbudov',           'Estrada', 200),
  ( 8, 'ZRScZIq8waA', 'Синяя вечность',              'Müslüm Maqomayev',         'Estrada', 260),
  ( 9, '0EDqGYwvSZE', 'Koroğlu uvertürası',          'Üzeyir Hacıbəyli',         'Klassik', 480),
  (10, '39QK-1GV-6Q', 'Tənhalıq',                    'Vaqif Mustafazadə',        'Caz',     330),
  (11, 'WGEHrRckwjg', 'Inspiration',                 'Əzizə Mustafazadə',        'Caz',     420),
  (12, 'OuWO5F7z4tw', 'Can Ol',                      'Aygün Kazımova',           'Pop',     215),
  (13, '9D4q0mJs3yQ', 'Üzbəüz',                      'Miri Yusif',               'Pop',     230),
  (14, 'rcLH74PtFUA', 'Yanındayam',                  'Röya',                     'Pop',     210),
  (15, 'inzqma8uZyE', 'Sevgi Bizi Yola Verdi',       'Natavan Həbibi',           'Pop',     200),
  (16, 'fJ9rUzIMcZQ', 'Bohemian Rhapsody',           'Queen',                    'Rok',     355),
  (17, 'hTWKbfoikeg', 'Smells Like Teen Spirit',     'Nirvana',                  'Rok',     301),
  (18, '1G4isv_Fylg', 'Paradise',                    'Coldplay',                 'Rok',     261),
  (19, 'dvgZkm1xWPE', 'Viva La Vida',                'Coldplay',                 'Rok',     242),
  (20, '7wtfhZwyrcc', 'Believer',                    'Imagine Dragons',          'Rok',     217),
  (21, 'JGwWNGJdvx8', 'Shape of You',                'Ed Sheeran',               'Pop',     263),
  (22, '2Vv-BfVoq4g', 'Perfect',                     'Ed Sheeran',               'Pop',     280),
  (23, 'YQHsXMglC9A', 'Hello',                       'Adele',                    'Pop',     367),
  (24, '4NRXx6U8ABQ', 'Blinding Lights',             'The Weeknd',               'Pop',     261),
  (25, 'OPf0YbXqDm0', 'Uptown Funk',                 'Mark Ronson ft. Bruno Mars','Funk',   270),
  (26, '60ItHLz5WEA', 'Faded',                       'Alan Walker',              'Elektron',212),
  (27, 'hT_nvWreIhg', 'Counting Stars',              'OneRepublic',              'Pop',     283),
  (28, 'pRpeEdMmmQ0', 'Waka Waka (This Time for Africa)', 'Shakira',             'Pop',     211),
  (29, 'kJQP7kiw5Fk', 'Despacito',                   'Luis Fonsi ft. Daddy Yankee','Latın', 282),
  (30, 'dQw4w9WgXcQ', 'Never Gonna Give You Up',     'Rick Astley',              'Pop',     213);

INSERT INTO playlists (id, user_id, name, created_at) VALUES
  (1, 1, 'Eurovision Azərbaycan', seed_ts('day', ('-50 days')::interval + ('+20 hours')::interval)),
  (2, 1, 'Dərs zamanı fon musiqisi', seed_ts('day', ('-20 days')::interval + ('+9 hours')::interval)),
  (3, 3, 'Rok klassikası', seed_ts('day', ('-35 days')::interval + ('+22 hours')::interval));

INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES
  (1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4), (1, 5, 5),
  (2, 10, 1), (2, 11, 2), (2, 9, 3), (2, 6, 4),
  (3, 16, 1), (3, 17, 2), (3, 18, 3), (3, 19, 4), (3, 20, 5);

-- Dinləmə tarixçəsi: "populyar treklər" sorğusu (GROUP BY track_id) üçün data.
WITH ph(user_id, track_id, days_ago, minute_of_day) AS (
  VALUES
  (1, 1, 14, 1200), (1, 1, 10, 1210), (1, 1, 3, 1230), (1, 3, 12, 1180), (1, 3, 2, 1190),
  (1, 10, 9, 540),  (1, 11, 9, 546),  (1, 24, 7, 1300), (1, 24, 5, 1310), (1, 24, 1, 1320),
  (1, 12, 6, 800),  (1, 14, 4, 820),  (1, 21, 2, 1000),
  (3, 16, 20, 1320),(3, 16, 11, 1325),(3, 17, 11, 1331),(3, 18, 8, 1260),(3, 24, 6, 1270),
  (3, 1, 5, 1100),  (3, 20, 3, 1110), (3, 16, 1, 1340),
  (2, 9, 15, 600),  (2, 6, 13, 610),  (2, 24, 4, 700)
)
INSERT INTO play_history (user_id, track_id, played_at)
SELECT user_id, track_id,
       seed_ts('day', ('-' || days_ago || ' days')::interval + ('+' || minute_of_day || ' minutes')::interval)
FROM ph
ORDER BY days_ago DESC, minute_of_day;
