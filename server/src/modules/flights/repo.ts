// Aviabilet repo — reys axtarışı (JOIN airports), bronlar, sərnişinlər.
import type { DB } from '../../db.js';

export interface FlightRow {
  id: number;
  flight_no: string;
  airline_code: string;
  airline_name: string;
  from_code: string;
  from_city: string;
  to_code: string;
  to_city: string;
  depart_at: string;
  arrive_at: string;
  duration_min: number;
  stops: number;
  price_minor: number;
  currency: string;
  seats_left: number;
}

export interface BookingRow {
  id: number;
  flight_id: number;
  owner_id: number; // = user_id (BOLA helper üçün alias)
  passengers: number;
  status: 'CONFIRMED' | 'CANCELLED';
  total_minor: number;
  currency: string;
  created_at: string;
  flight_no: string;
  from_code: string;
  to_code: string;
  depart_at: string;
}

export interface FlightSearch {
  from: string;
  to: string;
  date?: string;
  adults: number;
  stops?: number;
  now: string;
}

const FLIGHT_SELECT = `
  SELECT f.*, fa.city AS from_city, ta.city AS to_city
  FROM flights f
  JOIN airports fa ON fa.code = f.from_code
  JOIN airports ta ON ta.code = f.to_code`;

const SEARCH_WHERE = `
  WHERE f.from_code = @from AND f.to_code = @to
    AND f.depart_at > @now
    AND f.seats_left >= @adults
    AND (@date IS NULL OR date(f.depart_at) = @date)
    AND (@stops IS NULL OR f.stops <= @stops)`;

const BOOKING_SELECT = `
  SELECT b.id, b.flight_id, b.user_id AS owner_id, b.passengers, b.status, b.total_minor, b.currency, b.created_at,
         f.flight_no, f.from_code, f.to_code, f.depart_at
  FROM flight_bookings b JOIN flights f ON f.id = b.flight_id`;

const searchParams = (s: FlightSearch) => ({ ...s, date: s.date ?? null, stops: s.stops ?? null });

export const flightsRepo = {
  airports: (db: DB, q?: string) =>
    db
      .prepare(
        `SELECT code, city, country, name FROM airports
         WHERE @q IS NULL OR code LIKE @prefix OR city LIKE @like OR name LIKE @like
         ORDER BY code`,
      )
      .all({ q: q ?? null, prefix: `${(q ?? '').toUpperCase()}%`, like: `%${q ?? ''}%` }) as {
      code: string;
      city: string;
      country: string;
      name: string;
    }[],

  countSearch: (db: DB, s: FlightSearch) =>
    db.prepare(`SELECT COUNT(*) FROM flights f ${SEARCH_WHERE}`).pluck().get(searchParams(s)) as number,

  search: (db: DB, s: FlightSearch, orderBy: string, limit: number, offset: number) =>
    db
      .prepare(`${FLIGHT_SELECT} ${SEARCH_WHERE} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...searchParams(s), limit, offset }) as FlightRow[],

  getFlight: (db: DB, id: number) => db.prepare(`${FLIGHT_SELECT} WHERE f.id = ?`).get(id) as FlightRow | undefined,

  // "AND seats_left >= ?" — yer yoxlaması UPDATE-in özündədir: eyni anda iki bron gəlsə belə mənfi olmur.
  takeSeats: (db: DB, flightId: number, n: number) =>
    db.prepare(`UPDATE flights SET seats_left = seats_left - ? WHERE id = ? AND seats_left >= ?`).run(n, flightId, n).changes === 1,

  releaseSeats: (db: DB, flightId: number, n: number) =>
    db.prepare(`UPDATE flights SET seats_left = seats_left + ? WHERE id = ?`).run(n, flightId),

  insertBooking: (db: DB, b: { flight_id: number; user_id: number; passengers: number; total_minor: number; currency: string; at: string }) =>
    Number(
      db
        .prepare(
          `INSERT INTO flight_bookings (flight_id, user_id, passengers, status, total_minor, currency, created_at, updated_at)
           VALUES (@flight_id, @user_id, @passengers, 'CONFIRMED', @total_minor, @currency, @at, @at)`,
        )
        .run(b).lastInsertRowid,
    ),

  insertPassenger: (db: DB, bookingId: number, p: { firstName: string; lastName: string; masked: string | null }) =>
    db
      .prepare(`INSERT INTO flight_passengers (booking_id, first_name, last_name, passport_no_masked) VALUES (?, ?, ?, ?)`)
      .run(bookingId, p.firstName, p.lastName, p.masked),

  getBooking: (db: DB, id: number) => db.prepare(`${BOOKING_SELECT} WHERE b.id = ?`).get(id) as BookingRow | undefined,

  listBookings: (db: DB, userId: number, status?: string) =>
    db
      .prepare(`${BOOKING_SELECT} WHERE b.user_id = @userId AND (@status IS NULL OR b.status = @status) ORDER BY b.created_at DESC, b.id DESC`)
      .all({ userId, status: status ?? null }) as BookingRow[],

  passengersOf: (db: DB, bookingId: number) =>
    db
      .prepare(`SELECT first_name, last_name, passport_no_masked FROM flight_passengers WHERE booking_id = ? ORDER BY id`)
      .all(bookingId) as { first_name: string; last_name: string; passport_no_masked: string | null }[],

  cancelBooking: (db: DB, id: number, at: string) =>
    db.prepare(`UPDATE flight_bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?`).run(at, id),
};
