// Otel repo. Availability qaydası bir yerdə — OVERLAP fraqmentində:
//   iki tarix aralığı [a_in, a_out) və [b_in, b_out) kəsişir ⇔ a_in < b_out AND a_out > b_in
// (check_out günü yeni qonaq check_in edə bilər — aralıqlar yarı-açıqdır).
import type { DB } from '../../db.js';

export interface HotelRow {
  id: number;
  city: string;
  name: string;
  stars: number;
  price_per_night_minor: number;
  currency: string;
  rating: number;
  description: string;
  price_azn_minor: number | null;
  available_rooms: number | null;
}

export interface RoomRow {
  id: number;
  hotel_id: number;
  room_type: 'SINGLE' | 'DOUBLE' | 'SUITE' | 'FAMILY';
  capacity: number;
  price_per_night_minor: number;
  currency: string;
  available: 0 | 1 | null;
}

export interface HotelBookingRow {
  id: number;
  room_id: number;
  owner_id: number; // = user_id
  check_in: string;
  check_out: string;
  guests: number;
  status: 'CONFIRMED' | 'CANCELLED';
  total_minor: number;
  currency: string;
  created_at: string;
  updated_at: string;
  hotel_id: number;
  hotel_name: string;
  room_type: RoomRow['room_type'];
}

const OVERLAP = `
  b.room_id = r.id AND b.status = 'CONFIRMED'
  AND b.check_in < @checkOut AND b.check_out > @checkIn`;

// Otaq boşdur: tutum kifayətdir və (tarix verilməyibsə və ya kəsişən bron yoxdur)
const ROOM_FITS = `
  r.capacity >= @guests
  AND (@checkIn::text IS NULL OR NOT EXISTS (SELECT 1 FROM hotel_bookings b WHERE ${OVERLAP}))`;

export interface HotelSearch {
  city: string;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  stars: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

// Otelin qiyməti AZN-ə çevrilir: 1 AZN = rate X → X məbləği / rate = AZN (exchange_rates-in ən son tarixi).
const PRICE_AZN = `(CASE h.currency WHEN 'AZN' THEN h.price_per_night_minor
  ELSE CAST(ROUND(h.price_per_night_minor / (
    SELECT x.rate FROM exchange_rates x WHERE x.base = 'AZN' AND x.quote = h.currency ORDER BY x.rate_date DESC LIMIT 1
  )) AS INTEGER) END)`;

const SEARCH_WHERE = `
  WHERE h.city = @city
    AND (@stars::int IS NULL OR h.stars >= @stars)
    AND (@minPrice::int IS NULL OR ${PRICE_AZN} >= @minPrice)
    AND (@maxPrice::int IS NULL OR ${PRICE_AZN} <= @maxPrice)
    AND EXISTS (SELECT 1 FROM hotel_rooms r WHERE r.hotel_id = h.id AND ${ROOM_FITS})`;

const BOOKING_SELECT = `
  SELECT b.id, b.room_id, b.user_id AS owner_id, b.check_in, b.check_out, b.guests, b.status, b.total_minor, b.currency,
         b.created_at, b.updated_at, h.id AS hotel_id, h.name AS hotel_name, r.room_type
  FROM hotel_bookings b
  JOIN hotel_rooms r ON r.id = b.room_id
  JOIN hotels h ON h.id = r.hotel_id`;

export const hotelsRepo = {
  countSearch: async (db: DB, s: HotelSearch) => (await db.prepare(`SELECT COUNT(*) FROM hotels h ${SEARCH_WHERE}`).pluck().get(s)) as number,

  search: async (db: DB, s: HotelSearch, orderBy: string, limit: number, offset: number) =>
    (await db
            .prepare(
              `SELECT h.*, ${PRICE_AZN} AS price_azn_minor,
                CASE WHEN @checkIn::text IS NULL THEN NULL
                     ELSE (SELECT COUNT(*) FROM hotel_rooms r WHERE r.hotel_id = h.id AND ${ROOM_FITS}) END AS available_rooms
         FROM hotels h ${SEARCH_WHERE}
         ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`,
            )
            .all({ ...s, limit, offset })) as HotelRow[],

  getHotel: async (db: DB, id: number) =>
    (await db.prepare(`SELECT h.*, ${PRICE_AZN} AS price_azn_minor, NULL AS available_rooms FROM hotels h WHERE id = ?`).get(id)) as HotelRow | undefined,

  amenities: async (db: DB, hotelId: number) =>
    (await db.prepare(`SELECT amenity FROM hotel_amenities WHERE hotel_id = ? ORDER BY amenity`).pluck().all(hotelId)) as string[],

  rooms: async (db: DB, hotelId: number, checkIn: string | null, checkOut: string | null) =>
    (await db
            .prepare(
              `SELECT r.*, h.currency,
                CASE WHEN @checkIn::text IS NULL THEN NULL
                     ELSE (NOT EXISTS (SELECT 1 FROM hotel_bookings b WHERE ${OVERLAP}))::int END AS available
         FROM hotel_rooms r JOIN hotels h ON h.id = r.hotel_id
         WHERE r.hotel_id = @hotelId ORDER BY r.price_per_night_minor, r.id`,
            )
            .all({ hotelId, checkIn, checkOut })) as RoomRow[],

  getRoom: async (db: DB, id: number) =>
    (await db.prepare(`SELECT r.*, h.currency, NULL AS available FROM hotel_rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.id = ?`).get(id)) as RoomRow | undefined,

  // Kəsişən CONFIRMED bron (bronun özü istisna — PATCH üçün)
  findOverlap: async (db: DB, roomId: number, checkIn: string, checkOut: string, excludeBookingId: number | null = null) =>
    (await db
            .prepare(
              `SELECT b.id, b.check_in, b.check_out FROM hotel_bookings b, (SELECT @roomId::int AS id) r
         WHERE ${OVERLAP} AND (@exclude::int IS NULL OR b.id <> @exclude) LIMIT 1`,
            )
            .get({ roomId, checkIn, checkOut, exclude: excludeBookingId })) as { id: number; check_in: string; check_out: string } | undefined,

  insertBooking: async (db: DB, b: { room_id: number; user_id: number; check_in: string; check_out: string; guests: number; total_minor: number; currency: string; at: string }) =>
    Number(
      (await db
                .prepare(
                  `INSERT INTO hotel_bookings (room_id, user_id, check_in, check_out, guests, status, total_minor, currency, created_at, updated_at)
           VALUES (@room_id, @user_id, @check_in, @check_out, @guests, 'CONFIRMED', @total_minor, @currency, @at, @at)`,
                )
                .run(b)).lastInsertRowid,
    ),

  updateBooking: (db: DB, b: { id: number; check_in: string; check_out: string; guests: number; total_minor: number; at: string }) =>
    db
      .prepare(`UPDATE hotel_bookings SET check_in = @check_in, check_out = @check_out, guests = @guests, total_minor = @total_minor, updated_at = @at WHERE id = @id`)
      .run(b),

  cancelBooking: (db: DB, id: number, at: string) =>
    db.prepare(`UPDATE hotel_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(at, id),

  getBooking: async (db: DB, id: number) => (await db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id)) as HotelBookingRow | undefined,

  listBookings: async (db: DB, userId: number) =>
    (await db.prepare(`${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.check_in DESC, b.id DESC`).all(userId)) as HotelBookingRow[],
};
