// Aviabilet: axtarış + bron. Bron transaction-dır: yer yoxlanır → azaldılır → bron + sərnişinlər yazılır.
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { conflict, notFound } from '../../errors.js';
import { loadOwned } from '../../lib/bola.js';
import { isoNow } from '../../lib/crypto.js';
import { fromMinor } from '../../lib/money.js';
import { orderBy, offsetOf, pageOf } from '../../lib/listing.js';
import { writeAudit } from '../../lib/audit.js';
import type { AuthContext } from '../../types.js';
import { flightsRepo, type BookingRow, type FlightRow } from './repo.js';

export const toFlight = (f: FlightRow) => ({
  id: f.id,
  flightNo: f.flight_no,
  airline: { code: f.airline_code, name: f.airline_name },
  from: { code: f.from_code, city: f.from_city },
  to: { code: f.to_code, city: f.to_city },
  departAt: f.depart_at,
  arriveAt: f.arrive_at,
  durationMin: f.duration_min,
  stops: f.stops,
  price: fromMinor(f.price_minor),
  currency: f.currency,
  seatsLeft: f.seats_left,
});

// Pasport nömrəsi açıq saxlanmır: C12344821 → C****4821 (data minimization)
const maskPassport = (p?: string) => (p ? `${p.charAt(0)}****${p.slice(-4)}` : null);

const SORT = { price: 'f.price_minor', duration: 'f.duration_min', departAt: 'f.depart_at' };

export interface SearchQuery {
  from: string;
  to: string;
  date?: string;
  adults: number;
  stops?: number;
  sort: string;
  page: number;
  size: number;
}

export class FlightsService {
  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  private toBooking(b: BookingRow) {
    return {
      id: b.id,
      flightId: b.flight_id,
      flightNo: b.flight_no,
      route: `${b.from_code} → ${b.to_code}`,
      departAt: b.depart_at,
      status: b.status,
      passengers: flightsRepo.passengersOf(this.db, b.id).map((p) => ({ firstName: p.first_name, lastName: p.last_name, passportNoMasked: p.passport_no_masked })),
      total: fromMinor(b.total_minor),
      currency: b.currency,
      createdAt: b.created_at,
    };
  }

  airports(q?: string) {
    return { items: flightsRepo.airports(this.db, q) };
  }

  search(q: SearchQuery) {
    const s = { from: q.from, to: q.to, date: q.date, adults: q.adults, stops: q.stops, now: isoNow(this.ctx.config.now()) };
    const total = flightsRepo.countSearch(this.db, s);
    const rows = flightsRepo.search(this.db, s, orderBy(q.sort, SORT, 'f.id'), q.size, offsetOf(q.page, q.size));
    return pageOf(rows.map(toFlight), q.page, q.size, total);
  }

  getFlight(id: number) {
    const f = flightsRepo.getFlight(this.db, id);
    if (!f) throw notFound('FLIGHT_NOT_FOUND', 'Reys tapılmadı');
    return toFlight(f);
  }

  book(req: Request, body: { flightId: number; passengers: { firstName: string; lastName: string; passportNo?: string }[] }) {
    const auth = req.auth!;
    const n = body.passengers.length;
    const id = this.db.transaction(() => {
      const flight = flightsRepo.getFlight(this.db, body.flightId);
      if (!flight) throw notFound('FLIGHT_NOT_FOUND', 'Reys tapılmadı');
      if (!flightsRepo.takeSeats(this.db, flight.id, n)) {
        throw conflict('SOLD_OUT', `Bu reysdə kifayət qədər boş yer yoxdur (qalıb: ${flight.seats_left}, lazımdır: ${n})`);
      }
      const at = isoNow(this.ctx.config.now());
      const bookingId = flightsRepo.insertBooking(this.db, { flight_id: flight.id, user_id: auth.userId, passengers: n, total_minor: flight.price_minor * n, currency: flight.currency, at });
      for (const p of body.passengers) flightsRepo.insertPassenger(this.db, bookingId, { firstName: p.firstName, lastName: p.lastName, masked: maskPassport(p.passportNo) });
      writeAudit(this.db, req, this.ctx.config.now(), { action: 'FLIGHT_BOOKED', entity: 'flight_bookings', entityId: bookingId, details: { flightId: flight.id, passengers: n } });
      return bookingId;
    }).immediate();
    return this.toBooking(flightsRepo.getBooking(this.db, id)!);
  }

  listBookings(auth: AuthContext, status?: string) {
    return { items: flightsRepo.listBookings(this.db, auth.userId, status).map((b) => this.toBooking(b)) };
  }

  getBooking(auth: AuthContext, id: number) {
    return this.toBooking(loadOwned(flightsRepo.getBooking(this.db, id), auth, 'BOOKING_NOT_FOUND', 'Bron tapılmadı'));
  }

  // Soft delete: sətir qalır, status = CANCELLED, yerlər reysə qaytarılır.
  cancel(req: Request, id: number) {
    this.db.transaction(() => {
      const b = loadOwned(flightsRepo.getBooking(this.db, id), req.auth, 'BOOKING_NOT_FOUND', 'Bron tapılmadı');
      if (b.status === 'CANCELLED') throw conflict('BOOKING_ALREADY_CANCELLED', 'Bron artıq ləğv edilib');
      flightsRepo.cancelBooking(this.db, id, isoNow(this.ctx.config.now()));
      flightsRepo.releaseSeats(this.db, b.flight_id, b.passengers);
      writeAudit(this.db, req, this.ctx.config.now(), { action: 'FLIGHT_BOOKING_CANCELLED', entity: 'flight_bookings', entityId: id });
    }).immediate();
    return this.toBooking(flightsRepo.getBooking(this.db, id)!);
  }
}
