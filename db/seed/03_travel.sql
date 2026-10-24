-- 03_travel.sql — hava limanları, reyslər (gələcək 30 gün), otellər, otaqlar, bronlar
-- Vaxtlar UTC-dir (Bakı = UTC+4). Reyslər hər reset-də "sabahdan +30 günə qədər" yaradılır.

INSERT INTO airports (code, city, country, name) VALUES
  ('GYD', 'Bakı',      'Azərbaycan',      'Heydər Əliyev Beynəlxalq Hava Limanı'),
  ('GNJ', 'Gəncə',     'Azərbaycan',      'Gəncə Beynəlxalq Hava Limanı'),
  ('NAJ', 'Naxçıvan',  'Azərbaycan',      'Naxçıvan Beynəlxalq Hava Limanı'),
  ('IST', 'İstanbul',  'Türkiyə',         'İstanbul Hava Limanı'),
  ('SAW', 'İstanbul',  'Türkiyə',         'Sabiha Gökçen Hava Limanı'),
  ('DXB', 'Dubay',     'BƏƏ',             'Dubay Beynəlxalq Hava Limanı'),
  ('TBS', 'Tbilisi',   'Gürcüstan',       'Tbilisi Beynəlxalq Hava Limanı'),
  ('LHR', 'London',    'Böyük Britaniya', 'London Heathrow'),
  ('FRA', 'Frankfurt', 'Almaniya',        'Frankfurt Hava Limanı'),
  ('CDG', 'Paris',     'Fransa',          'Paris Şarl de Qoll');

-- Reys cədvəli: hər marşrut "every" gündən bir uçur. Qiymət və boş yer sayı düsturla dəyişir (deterministik).
-- seats_left = 0 olan reyslər → POST /flights/bookings 409 SOLD_OUT nümunəsi.
WITH RECURSIVE days(d) AS (
  SELECT 1 UNION ALL SELECT d + 1 FROM days WHERE d < 30
),
routes(r, from_code, to_code, airline_code, airline_name, flight_no, dep_minute, duration_min, stops, base_price_minor, every) AS (
  VALUES
  ( 1, 'GYD', 'IST', 'J2', 'Azerbaijan Airlines', 'J2 071',   300, 220, 0, 32000, 1),
  ( 2, 'IST', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 072',   600, 200, 0, 32000, 1),
  ( 3, 'GYD', 'IST', 'TK', 'Turkish Airlines',    'TK 337',   120, 225, 0, 38500, 1),
  ( 4, 'IST', 'GYD', 'TK', 'Turkish Airlines',    'TK 336',  1080, 205, 0, 38500, 1),
  ( 5, 'GYD', 'SAW', 'PC', 'Pegasus',             'PC 941',    30, 230, 0, 21000, 1),
  ( 6, 'SAW', 'GYD', 'PC', 'Pegasus',             'PC 940',   960, 210, 0, 21000, 1),
  ( 7, 'GYD', 'DXB', 'J2', 'Azerbaijan Airlines', 'J2 017',  1200, 180, 0, 41000, 1),
  ( 8, 'DXB', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 018',   300, 185, 0, 41000, 1),
  ( 9, 'GYD', 'DXB', 'FZ', 'flydubai',            'FZ 710',   480, 185, 0, 29500, 2),
  (10, 'DXB', 'GYD', 'FZ', 'flydubai',            'FZ 709',  1320, 190, 0, 29500, 2),
  (11, 'GYD', 'TBS', 'J2', 'Azerbaijan Airlines', 'J2 223',   360,  70, 0, 15000, 2),
  (12, 'TBS', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 224',   480,  65, 0, 15000, 2),
  (13, 'GYD', 'LHR', 'J2', 'Azerbaijan Airlines', 'J2 085',   420, 375, 0, 89000, 3),
  (14, 'LHR', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 086',  1140, 345, 0, 89000, 3),
  (15, 'GYD', 'LHR', 'TK', 'Turkish Airlines',    'TK 333',   120, 545, 1, 64000, 1),
  (16, 'GYD', 'FRA', 'LH', 'Lufthansa',           'LH 2621',  240, 330, 0, 72000, 2),
  (17, 'FRA', 'GYD', 'LH', 'Lufthansa',           'LH 2620', 1170, 300, 0, 72000, 2),
  (18, 'GYD', 'CDG', 'J2', 'Azerbaijan Airlines', 'J2 077',   360, 360, 0, 79000, 3),
  (19, 'CDG', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 078',  1110, 330, 0, 79000, 3),
  (20, 'GYD', 'NAJ', 'J2', 'Azerbaijan Airlines', 'J2 8601',  240,  75, 0,  9500, 1),
  (21, 'NAJ', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 8602',  420,  75, 0,  9500, 1),
  (22, 'GYD', 'GNJ', 'J2', 'Azerbaijan Airlines', 'J2 8501',  600,  50, 0,  6000, 2),
  (23, 'GNJ', 'GYD', 'J2', 'Azerbaijan Airlines', 'J2 8502',  720,  50, 0,  6000, 2)
)
INSERT INTO flights (flight_no, airline_code, airline_name, from_code, to_code, depart_at, arrive_at,
                     duration_min, stops, price_minor, currency, seats_left)
SELECT r.flight_no, r.airline_code, r.airline_name, r.from_code, r.to_code,
       seed_ts('day', ('+' || d.d || ' days')::interval + ('+' || r.dep_minute || ' minutes')::interval),
       seed_ts('day', ('+' || d.d || ' days')::interval + ('+' || (r.dep_minute + r.duration_min) || ' minutes')::interval),
       r.duration_min, r.stops,
       r.base_price_minor + ((d.d * 17 + r.r * 31) % 9) * 1000,
       'AZN',
       CASE WHEN (d.d * r.r) % 29 = 7 THEN 0 ELSE ((d.d * 13 + r.r * 7) % 60) + 1 END
FROM days d CROSS JOIN routes r
WHERE (d.d + r.r) % r.every = 0
ORDER BY d.d, r.dep_minute, r.r;

-- Hazır aviabilet bronları (reys id-si tarixdən asılıdır, ona görə subquery ilə tapılır)
INSERT INTO flight_bookings (id, flight_id, user_id, passengers, status, total_minor, currency, created_at, updated_at)
SELECT 1, f.id, 1, 2, 'CONFIRMED', f.price_minor * 2, f.currency,
       seed_ts('day', ('-5 days')::interval + ('+14 hours')::interval),
       seed_ts('day', ('-5 days')::interval + ('+14 hours')::interval)
FROM flights f WHERE f.flight_no = 'J2 071' AND f.depart_at >= seed_date('now', ('+7 days')::interval) ORDER BY f.depart_at LIMIT 1;

INSERT INTO flight_bookings (id, flight_id, user_id, passengers, status, total_minor, currency, created_at, updated_at)
SELECT 2, f.id, 3, 1, 'CONFIRMED', f.price_minor, f.currency,
       seed_ts('day', ('-2 days')::interval + ('+9 hours')::interval),
       seed_ts('day', ('-2 days')::interval + ('+9 hours')::interval)
FROM flights f WHERE f.flight_no = 'J2 017' AND f.depart_at >= seed_date('now', ('+14 days')::interval) ORDER BY f.depart_at LIMIT 1;

INSERT INTO flight_bookings (id, flight_id, user_id, passengers, status, total_minor, currency, created_at, updated_at)
SELECT 3, f.id, 1, 1, 'CANCELLED', f.price_minor, f.currency,
       seed_ts('day', ('-8 days')::interval + ('+16 hours')::interval),
       seed_ts('day', ('-6 days')::interval + ('+10 hours')::interval)
FROM flights f WHERE f.flight_no = 'J2 223' AND f.depart_at >= seed_date('now', ('+9 days')::interval) ORDER BY f.depart_at LIMIT 1;

INSERT INTO flight_passengers (booking_id, first_name, last_name, passport_no_masked) VALUES
  (1, 'Aysel',  'Məmmədova', 'C****4821'),
  (1, 'Elvin',  'Məmmədov',  'C****1937'),
  (2, 'Rauf',   'Həsənov',   'C****5560'),
  (3, 'Aysel',  'Məmmədova', 'C****4821');

-- Otellər. price_per_night_minor = ən ucuz (SINGLE) otağın qiyməti.
INSERT INTO hotels (id, city, name, stars, price_per_night_minor, currency, rating, description) VALUES
  ( 1, 'Bakı',     'Xəzər Sahil Hotel',        5, 28000, 'AZN', 9.1, 'Bulvarın üzərində, dəniz mənzərəli otaqlar və açıq hovuz.'),
  ( 2, 'Bakı',     'İçərişəhər Boutique',      4, 16000, 'AZN', 9.4, 'Qala divarlarının içində, tarixi binada butik otel.'),
  ( 3, 'Bakı',     'Flame View Residence',     4, 19000, 'AZN', 8.7, 'Alov qüllələrinə baxan müasir apart-otel.'),
  ( 4, 'Bakı',     'Nizami Park Hotel',        3,  9000, 'AZN', 8.2, 'Nizami küçəsinə 2 dəqiqə, metro yaxınlığında.'),
  ( 5, 'Bakı',     'Bulvar Inn',               2,  5500, 'AZN', 7.6, 'Sadə və təmiz, tələbələr üçün münasib qiymət.'),
  ( 6, 'Gəncə',    'Gəncə Palace Hotel',       4, 12000, 'AZN', 8.5, 'Şəhər mərkəzində, Cavad xan küçəsi yaxınlığında.'),
  ( 7, 'Gəncə',    'Göygöl Lodge',             3,  8500, 'AZN', 8.9, 'Göygöl milli parkına yaxın, dağ mənzərəli.'),
  ( 8, 'Qəbələ',   'Qəbələ Dağ Resort',        5, 24000, 'AZN', 9.0, 'Tufandağ kanat yoluna 5 dəqiqə, spa mərkəzi.'),
  ( 9, 'Qəbələ',   'Nohur Chalet',             3, 10000, 'AZN', 8.4, 'Nohur gölü sahilində taxta kotteclər.'),
  (10, 'İstanbul', 'Bosphorus Pearl Hotel',    5, 21000, 'EUR', 9.2, 'Boğaz sahilində, Beşiktaşda lüks otel.'),
  (11, 'İstanbul', 'Sultanahmet Garden',       3,  7500, 'EUR', 8.6, 'Ayasofyaya piyada 5 dəqiqə, bağlı həyət.'),
  (12, 'İstanbul', 'Taksim Loft',              4, 11000, 'EUR', 8.3, 'İstiklal küçəsinin yanında loft üslubunda otaqlar.'),
  (13, 'Dubay',    'Marina Skyline',           5, 32000, 'USD', 9.3, 'Dubai Marina-da, 40-cı mərtəbədə infinity hovuz.'),
  (14, 'Dubay',    'Deira Creek Hotel',        3,  9500, 'USD', 7.9, 'Qızıl bazarına yaxın, sərfəli seçim.'),
  (15, 'Tbilisi',  'Old Tbilisi House',        3,  6500, 'USD', 9.0, 'Abanotubanidə, kükürd hamamlarına 3 dəqiqə.'),
  (16, 'Tbilisi',  'Rustaveli Avenue Hotel',   4, 12500, 'USD', 8.8, 'Rustaveli prospektində, opera teatrının yanında.');

WITH amenity_list(hotel_id, amenity) AS (
  VALUES
  (1,'Wi-Fi'),(1,'Hovuz'),(1,'Spa'),(1,'Parkinq'),(1,'Səhər yeməyi'),(1,'Fitness'),
  (2,'Wi-Fi'),(2,'Səhər yeməyi'),(2,'Hava limanı transferi'),
  (3,'Wi-Fi'),(3,'Mətbəx'),(3,'Parkinq'),(3,'Fitness'),
  (4,'Wi-Fi'),(4,'Səhər yeməyi'),
  (5,'Wi-Fi'),
  (6,'Wi-Fi'),(6,'Restoran'),(6,'Parkinq'),(6,'Səhər yeməyi'),
  (7,'Wi-Fi'),(7,'Parkinq'),(7,'Restoran'),
  (8,'Wi-Fi'),(8,'Hovuz'),(8,'Spa'),(8,'Restoran'),(8,'Parkinq'),
  (9,'Wi-Fi'),(9,'Parkinq'),
  (10,'Wi-Fi'),(10,'Hovuz'),(10,'Spa'),(10,'Restoran'),(10,'Fitness'),
  (11,'Wi-Fi'),(11,'Səhər yeməyi'),
  (12,'Wi-Fi'),(12,'Fitness'),
  (13,'Wi-Fi'),(13,'Hovuz'),(13,'Spa'),(13,'Fitness'),(13,'Hava limanı transferi'),
  (14,'Wi-Fi'),(14,'Səhər yeməyi'),
  (15,'Wi-Fi'),(15,'Səhər yeməyi'),
  (16,'Wi-Fi'),(16,'Restoran'),(16,'Fitness')
)
INSERT INTO hotel_amenities (hotel_id, amenity) SELECT hotel_id, amenity FROM amenity_list;

-- Hər otelə SINGLE, DOUBLE, SUITE; 4–5 ulduzlulara əlavə FAMILY otağı.
WITH room_types(ord, room_type, capacity, multiplier, min_stars) AS (
  VALUES (1, 'SINGLE', 1, 100, 1), (2, 'DOUBLE', 2, 135, 1), (3, 'FAMILY', 4, 190, 4), (4, 'SUITE', 3, 240, 1)
)
INSERT INTO hotel_rooms (hotel_id, room_type, capacity, price_per_night_minor)
SELECT h.id, rt.room_type, rt.capacity, h.price_per_night_minor * rt.multiplier / 100
FROM hotels h JOIN room_types rt ON h.stars >= rt.min_stars
ORDER BY h.id, rt.ord;

-- Hazır otel bronları. Otaq 1 (Xəzər Sahil, SINGLE) +5..+8 gün doludur → üst-üstə düşən bron 409 ROOM_NOT_AVAILABLE.
WITH b(id, room_id, user_id, in_days, nights, guests, status, created_days_ago) AS (
  VALUES
  (1, 1, 3,   5, 3, 1, 'CONFIRMED', 4),
  (2, 2, 1,  10, 2, 2, 'CONFIRMED', 3),
  (3, 1, 1,  20, 2, 1, 'CANCELLED', 6),
  (4, 6, 1, -30, 3, 2, 'CONFIRMED', 45)
)
INSERT INTO hotel_bookings (id, room_id, user_id, check_in, check_out, guests, status, total_minor, currency, created_at, updated_at)
SELECT b.id, b.room_id, b.user_id,
       seed_date('now', (b.in_days || ' days')::interval),
       seed_date('now', ((b.in_days + b.nights) || ' days')::interval),
       b.guests, b.status, r.price_per_night_minor * b.nights, h.currency,
       seed_ts('day', ('-' || b.created_days_ago || ' days')::interval + ('+11 hours')::interval),
       seed_ts('day', ('-' || b.created_days_ago || ' days')::interval + ('+11 hours')::interval)
FROM b JOIN hotel_rooms r ON r.id = b.room_id JOIN hotels h ON h.id = r.hotel_id
ORDER BY b.id;
