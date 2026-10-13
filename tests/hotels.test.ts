// Otel: axtarış (availability SQL ilə), bron, tarix kəsişməsi 409, PATCH, soft cancel.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

async function setup() {
  const t = createTestApp();
  const day = (offset: number) => t.db.prepare(`SELECT date('now', ? || ' days')`).pluck().get(String(offset)) as string;
  return { ...t, day, student: (await t.login('student')).access_token, rauf: (await t.login('rauf')).access_token };
}
type T = Awaited<ReturnType<typeof setup>>;

describe('hotel search + rooms', () => {
  let t: T;
  beforeEach(async () => {
    t = await setup();
  });

  it('şəhər üzrə, ulduz filteri, reytinqə görə sort', async () => {
    const all = await t.api().get('/api/v1/hotels/search?city=Bakı');
    expect(all.status).toBe(200);
    expectMatchesSpec(all, 'searchHotels');
    expect(all.body.total).toBe(5);
    expect(all.body.items[0].name).toBe('Bulvar Inn'); // default sort=price
    expect(all.body.items[0]).not.toHaveProperty('availableRooms');

    const stars = await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', stars: 4, sort: '-rating' });
    expect(stars.body.items.map((h: { name: string }) => h.name)).toEqual(['İçərişəhər Boutique', 'Xəzər Sahil Hotel', 'Flame View Residence']);
  });

  it('tarixlər verildikdə availableRooms: dolu otaq sayılmır; guests=4 yalnız FAMILY otaqlı otellər', async () => {
    // Otaq 1 (Xəzər Sahil, SINGLE) +5…+8 gün doludur (seed)
    const res = await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', checkIn: t.day(6), checkOut: t.day(7) });
    const xezer = res.body.items.find((h: { id: number }) => h.id === 1);
    expect(xezer.availableRooms).toBe(3);
    const family = await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', guests: 4 });
    expect(family.body.items.every((h: { stars: number }) => h.stars >= 4)).toBe(true);

    const rooms = await t.api().get('/api/v1/hotels/1/rooms').query({ checkIn: t.day(6), checkOut: t.day(7) });
    expectMatchesSpec(rooms, 'listHotelRooms');
    expect(rooms.body.items.find((r: { id: number }) => r.id === 1).available).toBe(false);
    expect(rooms.body.items.filter((r: { available: boolean }) => r.available)).toHaveLength(3);
  });

  it('error path-lər: checkOut ≤ checkIn 422, yalnız checkIn 422, keçmiş tarix 422, city yoxdur 422, olmayan otel 404', async () => {
    const range = await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', checkIn: t.day(5), checkOut: t.day(5) });
    expect(range.status).toBe(422);
    expectMatchesSpec(range, 'searchHotels');
    expect(range.body.code).toBe('INVALID_DATE_RANGE');
    expect((await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', checkIn: t.day(5) })).body.code).toBe('INVALID_DATE_RANGE');
    expect((await t.api().get('/api/v1/hotels/search').query({ city: 'Bakı', checkIn: t.day(-2), checkOut: t.day(1) })).body.code).toBe('INVALID_DATE_RANGE');
    expect((await t.api().get('/api/v1/hotels/search')).body.code).toBe('VALIDATION_ERROR');
    const nf = await t.api().get('/api/v1/hotels/999');
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('HOTEL_NOT_FOUND');
    const hotel = await t.api().get('/api/v1/hotels/1');
    expectMatchesSpec(hotel, 'getHotel');
    expect(hotel.body).toMatchObject({ roomCount: 4, stars: 5 });
  });
});

describe('hotel bookings', () => {
  let t: T;
  beforeEach(async () => {
    t = await setup();
  });
  const book = (t: T, body: object, token = t.student) => t.api().post('/api/v1/hotels/bookings').set(bearer(token)).send(body);

  it('201 + Location, total = gecə × qiymət', async () => {
    const res = await book(t, { roomId: 4, checkIn: t.day(20), checkOut: t.day(23), guests: 2 });
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createHotelBooking');
    expect(res.headers.location).toBe(`/api/v1/hotels/bookings/${res.body.id}`);
    expect(res.body).toMatchObject({ nights: 3, roomType: 'SUITE', total: 2016, currency: 'AZN', status: 'CONFIRMED' });
    const mine = await t.api().get('/api/v1/hotels/bookings').set(bearer(t.student));
    expectMatchesSpec(mine, 'listHotelBookings');
    expect(mine.body.items.map((b: { id: number }) => b.id)).toContain(res.body.id);
  });

  it('TARİX KƏSİŞMƏSİ → 409 ROOM_NOT_AVAILABLE; sərhəd (check_out günü check_in) və ləğv edilmiş bron mane olmur', async () => {
    // Seed: otaq 1 → +5…+8 CONFIRMED (rauf), +20…+22 CANCELLED
    const overlap = await book(t, { roomId: 1, checkIn: t.day(6), checkOut: t.day(7), guests: 1 });
    expect(overlap.status).toBe(409);
    expectMatchesSpec(overlap, 'createHotelBooking');
    expect(overlap.body.code).toBe('ROOM_NOT_AVAILABLE');
    expect(overlap.body.details[0].message).toContain('#1');

    const covering = await book(t, { roomId: 1, checkIn: t.day(4), checkOut: t.day(10), guests: 1 });
    expect(covering.status).toBe(409);

    const adjacent = await book(t, { roomId: 1, checkIn: t.day(8), checkOut: t.day(10), guests: 1 });
    expect(adjacent.status).toBe(201);

    const overCancelled = await book(t, { roomId: 1, checkIn: t.day(20), checkOut: t.day(22), guests: 1 });
    expect(overCancelled.status).toBe(201);

    // Eyni tarixlərə ikinci bron — artıq doludur
    expect((await book(t, { roomId: 1, checkIn: t.day(20), checkOut: t.day(21), guests: 1 }, t.rauf)).status).toBe(409);
    const confirmed = t.db.prepare(`SELECT COUNT(*) FROM hotel_bookings WHERE room_id = 1 AND status = 'CONFIRMED'`).pluck().get();
    expect(confirmed).toBe(3);
  });

  it('error path-lər: tutum 422, keçmiş tarix 422, olmayan otaq 404, tokensiz 401, başqasının bronu 403', async () => {
    expect((await book(t, { roomId: 1, checkIn: t.day(40), checkOut: t.day(41), guests: 2 })).body.code).toBe('ROOM_CAPACITY_EXCEEDED');
    expect((await book(t, { roomId: 2, checkIn: t.day(-1), checkOut: t.day(1), guests: 1 })).body.code).toBe('INVALID_DATE_RANGE');
    expect((await book(t, { roomId: 9999, checkIn: t.day(40), checkOut: t.day(41), guests: 1 })).body.code).toBe('ROOM_NOT_FOUND');
    expect((await t.api().post('/api/v1/hotels/bookings').send({ roomId: 2, checkIn: t.day(40), checkOut: t.day(41), guests: 1 })).status).toBe(401);
    const others = await t.api().get('/api/v1/hotels/bookings/1').set(bearer(t.student)); // rauf-un bronu
    expect(others.status).toBe(403);
    expectMatchesSpec(others, 'getHotelBooking');
  });

  it('PATCH: checkOut uzadılır (nights/total yenilənir), kəsişməyə gətirən dəyişiklik 409, boş body 422', async () => {
    // Bron 2: student, otaq 2, +10…+12
    const res = await t.api().patch('/api/v1/hotels/bookings/2').set(bearer(t.student)).send({ checkOut: t.day(13) });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'updateHotelBooking');
    expect(res.body).toMatchObject({ nights: 3, checkIn: t.day(10), checkOut: t.day(13) });

    const other = await book(t, { roomId: 2, checkIn: t.day(14), checkOut: t.day(16), guests: 1 });
    expect(other.status).toBe(201);
    const clash = await t.api().patch('/api/v1/hotels/bookings/2').set(bearer(t.student)).send({ checkOut: t.day(15) });
    expect(clash.status).toBe(409);
    expect((await t.api().patch('/api/v1/hotels/bookings/2').set(bearer(t.student)).send({})).status).toBe(422);
    expect((await t.api().patch('/api/v1/hotels/bookings/1').set(bearer(t.student)).send({ guests: 1 })).status).toBe(403);
  });

  it('DELETE: CANCELLED, tarixlər yenidən boşalır; ikinci dəfə 409', async () => {
    const res = await t.api().delete('/api/v1/hotels/bookings/1').set(bearer(t.rauf));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'cancelHotelBooking');
    expect(res.body.status).toBe('CANCELLED');
    expect((await book(t, { roomId: 1, checkIn: t.day(6), checkOut: t.day(7), guests: 1 })).status).toBe(201);
    const again = await t.api().delete('/api/v1/hotels/bookings/1').set(bearer(t.rauf));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('BOOKING_ALREADY_CANCELLED');
  });
});

describe('hotel qiymətləri AZN ilə', () => {
  it('minPrice/maxPrice AZN-dir: 75 EUR (~148 AZN) ≤ 200 AZN, 110 EUR (~217 AZN) > 200 AZN; cavabda həm orijinal, həm AZN', async () => {
    const t = createTestApp();
    const eurRate = t.db.prepare(`SELECT rate FROM exchange_rates WHERE quote = 'EUR' ORDER BY rate_date DESC LIMIT 1`).pluck().get() as number;
    const res = await t.api().get('/api/v1/hotels/search').query({ city: 'İstanbul', maxPrice: 200 });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'searchHotels');
    expect(res.body.items.map((h: { name: string }) => h.name)).toEqual(['Sultanahmet Garden']);
    expect(res.body.items[0]).toMatchObject({ pricePerNightFrom: 75, currency: 'EUR', pricePerNightFromAzn: Math.round(7500 / eurRate) / 100 });

    const min = await t.api().get('/api/v1/hotels/search').query({ city: 'İstanbul', minPrice: 200, sort: '-price' });
    expect(min.body.items.map((h: { name: string }) => h.name)).toEqual(['Bosphorus Pearl Hotel', 'Taksim Loft']);
    const baku = await t.api().get('/api/v1/hotels/1');
    expect(baku.body).toMatchObject({ pricePerNightFrom: 280, pricePerNightFromAzn: 280 });
  });
});
