// Otel: axtarış + bron. Bron/dəyişiklik BEGIN IMMEDIATE transaction-da:
// kəsişmə yoxlaması ilə INSERT/UPDATE arasında başqa bron yarana bilməz (race condition yoxdur).
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { conflict, notFound, unprocessable } from '../../errors.js';
import { loadOwned } from '../../lib/bola.js';
import { isoNow } from '../../lib/crypto.js';
import { fromMinor, toMinor } from '../../lib/money.js';
import { orderBy, offsetOf, pageOf } from '../../lib/listing.js';
import { writeAudit } from '../../lib/audit.js';
import type { AuthContext } from '../../types.js';
import { hotelsRepo, type HotelBookingRow, type HotelRow, type RoomRow } from './repo.js';

const MAX_NIGHTS = 30;
// price — AZN ekvivalentinə görə (fərqli valyutalı otellər düzgün müqayisə olunsun)
const SORT = { price: 'price_azn_minor', rating: 'h.rating', stars: 'h.stars' };
const nightsBetween = (checkIn: string, checkOut: string) => Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);

export class HotelsService {
  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  private today() {
    return isoNow(this.ctx.config.now()).slice(0, 10);
  }

  // Tarix aralığı qaydaları: ikisi birlikdə verilməlidir, checkIn bu gün və ya sonra, checkOut > checkIn, maks. 30 gecə.
  private checkDates(checkIn?: string, checkOut?: string, required = false): { checkIn: string; checkOut: string } | null {
    if (!checkIn && !checkOut && !required) return null;
    const invalid = (message: string) => unprocessable('INVALID_DATE_RANGE', message);
    if (!checkIn || !checkOut) throw invalid('checkIn və checkOut birlikdə göndərilməlidir');
    if (checkIn < this.today()) throw invalid('checkIn bu gündən əvvəl ola bilməz');
    if (checkOut <= checkIn) throw invalid('checkOut checkIn-dən sonra olmalıdır');
    if (nightsBetween(checkIn, checkOut) > MAX_NIGHTS) throw invalid(`Maksimum ${MAX_NIGHTS} gecə`);
    return { checkIn, checkOut };
  }

  private async toHotel(h: HotelRow) {
    return {
      id: h.id,
      name: h.name,
      city: h.city,
      stars: h.stars,
      rating: h.rating,
      pricePerNightFrom: fromMinor(h.price_per_night_minor),
      currency: h.currency,
      pricePerNightFromAzn: h.price_azn_minor === null ? null : fromMinor(h.price_azn_minor),
      amenities: await hotelsRepo.amenities(this.db, h.id),
      ...(h.available_rooms === null ? {} : { availableRooms: h.available_rooms }),
    };
  }

  private toRoom = (r: RoomRow) => ({
    id: r.id,
    hotelId: r.hotel_id,
    roomType: r.room_type,
    capacity: r.capacity,
    pricePerNight: fromMinor(r.price_per_night_minor),
    currency: r.currency,
    ...(r.available === null ? {} : { available: r.available === 1 }),
  });

  private toBooking = (b: HotelBookingRow) => ({
    id: b.id,
    roomId: b.room_id,
    hotelId: b.hotel_id,
    hotelName: b.hotel_name,
    roomType: b.room_type,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: nightsBetween(b.check_in, b.check_out),
    guests: b.guests,
    status: b.status,
    total: fromMinor(b.total_minor),
    currency: b.currency,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  });

  async search(q: { city: string; checkIn?: string; checkOut?: string; guests: number; stars?: number; minPrice?: number; maxPrice?: number; sort: string; page: number; size: number }) {
    const dates = this.checkDates(q.checkIn, q.checkOut);
    const s = {
      city: q.city,
      checkIn: dates?.checkIn ?? null,
      checkOut: dates?.checkOut ?? null,
      guests: q.guests,
      stars: q.stars ?? null,
      minPrice: q.minPrice === undefined ? null : toMinor(q.minPrice),
      maxPrice: q.maxPrice === undefined ? null : toMinor(q.maxPrice),
    };
    const total = await hotelsRepo.countSearch(this.db, s);
    const rows = await hotelsRepo.search(this.db, s, orderBy(q.sort, SORT, 'h.id'), q.size, offsetOf(q.page, q.size));
    return pageOf(await Promise.all(rows.map((h) => this.toHotel(h))), q.page, q.size, total);
  }

  async getHotel(id: number) {
    const h = await hotelsRepo.getHotel(this.db, id);
    if (!h) throw notFound('HOTEL_NOT_FOUND', 'Otel tapılmadı');
    return { ...await this.toHotel(h), description: h.description, roomCount: (await hotelsRepo.rooms(this.db, id, null, null)).length };
  }

  async rooms(hotelId: number, checkIn?: string, checkOut?: string) {
    if (!(await hotelsRepo.getHotel(this.db, hotelId))) throw notFound('HOTEL_NOT_FOUND', 'Otel tapılmadı');
    const dates = this.checkDates(checkIn, checkOut);
    return { items: (await hotelsRepo.rooms(this.db, hotelId, dates?.checkIn ?? null, dates?.checkOut ?? null)).map(this.toRoom) };
  }

  private async assertBookable(room: RoomRow, checkIn: string, checkOut: string, guests: number, excludeBookingId: number | null) {
    if (guests > room.capacity) throw unprocessable('ROOM_CAPACITY_EXCEEDED', `Otaq tutumu: ${room.capacity}, qonaq: ${guests}`);
    const overlap = await hotelsRepo.findOverlap(this.db, room.id, checkIn, checkOut, excludeBookingId);
    if (overlap) {
      throw conflict('ROOM_NOT_AVAILABLE', 'Otaq seçilmiş tarixlərdə doludur', [
        { field: 'checkIn', message: `Kəsişən bron: #${overlap.id} (${overlap.check_in} – ${overlap.check_out})` },
      ]);
    }
  }

  async book(req: Request, body: { roomId: number; checkIn: string; checkOut: string; guests: number }) {
    const { checkIn, checkOut } = this.checkDates(body.checkIn, body.checkOut, true)!;
    const id = await this.db.transaction(async () => {
          const room = await hotelsRepo.getRoom(this.db, body.roomId);
          if (!room) throw notFound('ROOM_NOT_FOUND', 'Otaq tapılmadı');
          await this.assertBookable(room, checkIn, checkOut, body.guests, null);
          const bookingId = await hotelsRepo.insertBooking(this.db, {
                  room_id: room.id,
                  user_id: req.auth!.userId,
                  check_in: checkIn,
                  check_out: checkOut,
                  guests: body.guests,
                  total_minor: room.price_per_night_minor * nightsBetween(checkIn, checkOut),
                  currency: room.currency,
                  at: isoNow(this.ctx.config.now()),
                });
          await writeAudit(this.db, req, this.ctx.config.now(), { action: 'HOTEL_BOOKED', entity: 'hotel_bookings', entityId: bookingId, details: { roomId: room.id, checkIn, checkOut } });
          return bookingId;
        }).immediate();
    return this.toBooking((await hotelsRepo.getBooking(this.db, id))!);
  }

  async listBookings(auth: AuthContext) {
    return { items: (await hotelsRepo.listBookings(this.db, auth.userId)).map(this.toBooking) };
  }

  async getBooking(auth: AuthContext, id: number) {
    return this.toBooking(loadOwned(await hotelsRepo.getBooking(this.db, id), auth, 'BOOKING_NOT_FOUND', 'Bron tapılmadı'));
  }

  async update(req: Request, id: number, patch: { checkIn?: string; checkOut?: string; guests?: number }) {
    await this.db.transaction(async () => {
            const b = loadOwned(await hotelsRepo.getBooking(this.db, id), req.auth, 'BOOKING_NOT_FOUND', 'Bron tapılmadı');
            if (b.status === 'CANCELLED') throw conflict('BOOKING_ALREADY_CANCELLED', 'Ləğv edilmiş bron dəyişdirilə bilməz');
            const { checkIn, checkOut } = this.checkDates(patch.checkIn ?? b.check_in, patch.checkOut ?? b.check_out, true)!;
            const guests = patch.guests ?? b.guests;
            const room = (await hotelsRepo.getRoom(this.db, b.room_id))!;
            await this.assertBookable(room, checkIn, checkOut, guests, b.id);
            await hotelsRepo.updateBooking(this.db, {
                      id,
                      check_in: checkIn,
                      check_out: checkOut,
                      guests,
                      total_minor: room.price_per_night_minor * nightsBetween(checkIn, checkOut),
                      at: isoNow(this.ctx.config.now()),
                    });
            await writeAudit(this.db, req, this.ctx.config.now(), { action: 'HOTEL_BOOKING_UPDATED', entity: 'hotel_bookings', entityId: id, details: patch });
          }).immediate();
    return this.toBooking((await hotelsRepo.getBooking(this.db, id))!);
  }

  async cancel(req: Request, id: number) {
    await this.db.transaction(async () => {
            const b = loadOwned(await hotelsRepo.getBooking(this.db, id), req.auth, 'BOOKING_NOT_FOUND', 'Bron tapılmadı');
            if (b.status === 'CANCELLED') throw conflict('BOOKING_ALREADY_CANCELLED', 'Bron artıq ləğv edilib');
            await hotelsRepo.cancelBooking(this.db, id, isoNow(this.ctx.config.now()));
            await writeAudit(this.db, req, this.ctx.config.now(), { action: 'HOTEL_BOOKING_CANCELLED', entity: 'hotel_bookings', entityId: id });
          }).immediate();
    return this.toBooking((await hotelsRepo.getBooking(this.db, id))!);
  }
}
