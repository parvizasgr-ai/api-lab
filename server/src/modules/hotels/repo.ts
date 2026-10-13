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
  AND (@checkIn IS NULL OR NOT EXISTS (SELECT 1 FROM hotel_bookings b WHERE ${OVERLAP}))`;

export interface HotelSearch {
  city: string;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  stars: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

const SEARCH_WHERE = `
  WHERE h.city = @city
    AND (@stars IS NULL OR h.stars >= @stars)
    AND (@minPrice IS NULL OR h.price_per_night_minor >= @minPrice)
    AND (@maxPrice IS NULL OR h.price_per_night_minor <= @maxPrice)
    AND EXISTS (SELECT 1 FROM hotel_rooms r WHERE r.hotel_id = h.id AND ${ROOM_FITS})`;

const BOOKING_SELECT = `
  SELECT b.id, b.room_id, b.user_id AS owner_id, b.check_in, b.check_out, b.guests, b.status, b.total_minor, b.currency,
         b.created_at, b.updated_at, h.id AS hotel_id, h.name AS hotel_name, r.room_type
  FROM hotel_bookings b
  JOIN hotel_rooms r ON r.id = b.room_id
  JOIN hotels h ON h.id = r.hotel_id`;

export const hotelsRepo = {
  countSearch: (db: DB, s: HotelSearch) => db.prepare(`SELECT COUNT(*) FROM hotels h ${SEARCH_WHERE}`).pluck().get(s) as number,

  search: (db: DB, s: HotelSearch, orderBy: string, limit: number, offset: number) =>
    db
      .prepare(
        `SELECT h.*,
                CASE WHEN @checkIn IS NULL THEN NULL
                     ELSE (SELECT COUNT(*) FROM hotel_rooms r WHERE r.hotel_id = h.id AND ${ROOM_FITS}) END AS available_rooms
         FROM hotels h ${SEARCH_WHERE}
         ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`,
      )
      .all({ ...s, limit, offset }) as HotelRow[],

  getHotel: (db: DB, id: number) => db.prepare(`SELECT h.*, NULL AS available_rooms FROM hotels h WHERE id = ?`).get(id) as HotelRow | undefined,

  amenities: (db: DB, hotelId: number) =>
    db.prepare(`SELECT amenity FROM hotel_amenities WHERE hotel_id = ? ORDER BY amenity`).pluck().all(hotelId) as string[],

  rooms: (db: DB, hotelId: number, checkIn: string | null, checkOut: string | null) =>
    db
      .prepare(
        `SELECT r.*, h.currency,
                CASE WHEN @checkIn IS NULL THEN NULL
                     ELSE NOT EXISTS (SELECT 1 FROM hotel_bookings b WHERE ${OVERLAP}) END AS available
         FROM hotel_rooms r JOIN hotels h ON h.id = r.hotel_id
         WHERE r.hotel_id = @hotelId ORDER BY r.price_per_night_minor, r.id`,
      )
      .all({ hotelId, checkIn, checkOut }) as RoomRow[],

  getRoom: (db: DB, id: number) =>
    db.prepare(`SELECT r.*, h.currency, NULL AS available FROM hotel_rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.id = ?`).get(id) as RoomRow | undefined,

  // Kəsişən CONFIRMED bron (bronun özü istisna — PATCH üçün)
  findOverlap: (db: DB, roomId: number, checkIn: string, checkOut: string, excludeBookingId: number | null = null) =>
    db
      .prepare(
        `SELECT b.id, b.check_in, b.check_out FROM hotel_bookings b, (SELECT @roomId AS id) r
         WHERE ${OVERLAP} AND (@exclude IS NULL OR b.id <> @exclude) LIMIT 1`,
      )
      .get({ roomId, checkIn, checkOut, exclude: excludeBookingId }) as { id: number; check_in: string; check_out: string } | undefined,

  insertBooking: (db: DB, b: { room_id: number; user_id: number; check_in: string; check_out: string; guests: number; total_minor: number; currency: string; at: string }) =>
    Number(
      db
        .prepare(
          `INSERT INTO hotel_bookings (room_id, user_id, check_in, check_out, guests, status, total_minor, currency, created_at, updated_at)
           VALUES (@room_id, @user_id, @check_in, @check_out, @guests, 'CONFIRMED', @total_minor, @currency, @at, @at)`,
        )
        .run(b).lastInsertRowid,
    ),

  updateBooking: (db: DB, b: { id: number; check_in: string; check_out: string; guests: number; total_minor: number; at: string }) =>
    db
      .prepare(`UPDATE hotel_bookings SET check_in = @check_in, check_out = @check_out, guests = @guests, total_minor = @total_minor, updated_at = @at WHERE id = @id`)
      .run(b),

  cancelBooking: (db: DB, id: number, at: string) =>
    db.prepare(`UPDATE hotel_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(at, id),

  getBooking: (db: DB, id: number) => db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id) as HotelBookingRow | undefined,

  listBookings: (db: DB, userId: number) =>
    db.prepare(`${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.check_in DESC, b.id DESC`).all(userId) as HotelBookingRow[],
};
