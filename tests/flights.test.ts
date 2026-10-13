// Aviabilet: axtarış, bron (seats_left transaction), SOLD_OUT, BOLA, soft cancel.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

async function setup() {
  const t = createTestApp();
  return { ...t, student: (await t.login('student')).access_token, rauf: (await t.login('rauf')).access_token };
}

const seats = (t: Awaited<ReturnType<typeof setup>>, id: number) => t.db.prepare(`SELECT seats_left FROM flights WHERE id = ?`).pluck().get(id) as number;

describe('airports + search', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it('GET /airports?q= — kod, şəhər və ad üzrə', async () => {
    const res = await t.api().get('/api/v1/airports?q=bak');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listAirports');
    expect(res.body.items.map((a: { code: string }) => a.code)).toEqual(['GYD']);
    const ist = await t.api().get('/api/v1/airports?q=İstanbul');
    expect(ist.body.items.map((a: { code: string }) => a.code)).toEqual(['IST', 'SAW']);
    expect((await t.api().get('/api/v1/airports')).body.items).toHaveLength(10);
  });

  it('GET /flights/search — tarix üzrə, qiymətə görə sıralı, yeri olanlar', async () => {
    const date = t.db.prepare(`SELECT date('now', '+3 days')`).pluck().get() as string;
    const res = await t.api().get('/api/v1/flights/search').query({ from: 'GYD', to: 'IST', date, adults: 2 });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'searchFlights');
    expect(res.body.total).toBeGreaterThan(0);
    const items = res.body.items as { departAt: string; price: number; seatsLeft: number; from: { code: string } }[];
    expect(items.every((f) => f.departAt.startsWith(date) && f.seatsLeft >= 2 && f.from.code === 'GYD')).toBe(true);
    expect(items.map((f) => f.price)).toEqual([...items.map((f) => f.price)].sort((a, b) => a - b));
  });

  it('stops=0 aktarmalı reysləri çıxarır, sort=duration', async () => {
    const all = await t.api().get('/api/v1/flights/search').query({ from: 'GYD', to: 'LHR', size: 100 });
    const direct = await t.api().get('/api/v1/flights/search').query({ from: 'GYD', to: 'LHR', stops: 0, sort: 'duration', size: 100 });
    expect(all.body.items.some((f: { stops: number }) => f.stops === 1)).toBe(true);
    expect(direct.body.items.every((f: { stops: number; flightNo: string }) => f.stops === 0 && f.flightNo === 'J2 085')).toBe(true);
  });

  it('error path-lər: to yoxdur 422, kiçik hərf kod 422, olmayan reys 404', async () => {
    const missing = await t.api().get('/api/v1/flights/search').query({ from: 'GYD' });
    expect(missing.status).toBe(422);
    expectMatchesSpec(missing, 'searchFlights');
    expect((await t.api().get('/api/v1/flights/search').query({ from: 'gyd', to: 'IST' })).status).toBe(422);
    const notFound = await t.api().get('/api/v1/flights/999999');
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe('FLIGHT_NOT_FOUND');
  });
});

describe('bookings', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  const roomyFlight = (t: Awaited<ReturnType<typeof setup>>, min = 5) =>
    t.db.prepare(`SELECT id FROM flights WHERE seats_left >= ? ORDER BY id LIMIT 1`).pluck().get(min) as number;

  it('POST → 201 + Location; seats_left sərnişin sayı qədər azalır; pasport maskalanır', async () => {
    const flightId = roomyFlight(t);
    const before = seats(t, flightId);
    const res = await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({
      flightId,
      passengers: [{ firstName: 'Aysel', lastName: 'Məmmədova', passportNo: 'C12344821' }, { firstName: 'Elvin', lastName: 'Məmmədov' }],
    });
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createFlightBooking');
    expect(res.headers.location).toBe(`/api/v1/flights/bookings/${res.body.id}`);
    expect(res.body.passengers[0].passportNoMasked).toBe('C****4821');
    expect(seats(t, flightId)).toBe(before - 2);
    const price = t.db.prepare(`SELECT price_minor FROM flights WHERE id = ?`).pluck().get(flightId) as number;
    expect(res.body.total).toBe((price * 2) / 100);
    expect(t.db.prepare(`SELECT passport_no_masked FROM flight_passengers WHERE booking_id = ?`).pluck().all(res.body.id)).toEqual(['C****4821', null]);

    const get = await t.api().get(res.headers.location).set(bearer(t.student));
    expectMatchesSpec(get, 'getFlightBooking');
    const mine = await t.api().get('/api/v1/flights/bookings?status=CONFIRMED').set(bearer(t.student));
    expectMatchesSpec(mine, 'listFlightBookings');
    expect(mine.body.items.map((b: { id: number }) => b.id)).toContain(res.body.id);
  });

  it('SOLD_OUT 409: boş yer yoxdur və ya sərnişin sayı qalan yerdən çoxdur — seats_left dəyişmir', async () => {
    const soldOut = t.db.prepare(`SELECT id FROM flights WHERE seats_left = 0 LIMIT 1`).pluck().get() as number;
    const res = await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({ flightId: soldOut, passengers: [{ firstName: 'A', lastName: 'B' }] });
    expect(res.status).toBe(409);
    expectMatchesSpec(res, 'createFlightBooking');
    expect(res.body.code).toBe('SOLD_OUT');

    const few = t.db.prepare(`SELECT id FROM flights WHERE seats_left = 2 LIMIT 1`).pluck().get() as number;
    const three = Array.from({ length: 3 }, (_, i) => ({ firstName: `P${i}`, lastName: 'Test' }));
    const tooMany = await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({ flightId: few, passengers: three });
    expect(tooMany.status).toBe(409);
    expect(seats(t, few)).toBe(2);
    expect(t.db.prepare(`SELECT COUNT(*) FROM flight_bookings`).pluck().get()).toBe(3); // yalnız seed
  });

  it('error path-lər: tokensiz 401, sərnişinsiz 422, olmayan reys 404, başqasının bronu 403', async () => {
    expect((await t.api().post('/api/v1/flights/bookings').send({ flightId: 1, passengers: [{ firstName: 'A', lastName: 'B' }] })).status).toBe(401);
    expect((await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({ flightId: 1, passengers: [] })).status).toBe(422);
    const nf = await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({ flightId: 999999, passengers: [{ firstName: 'A', lastName: 'B' }] });
    expect(nf.status).toBe(404);
    const others = await t.api().get('/api/v1/flights/bookings/1').set(bearer(t.rauf));
    expect(others.status).toBe(403);
    expectMatchesSpec(others, 'getFlightBooking');
  });

  it('DELETE — soft cancel: status CANCELLED, yerlər qaytarılır; ikinci dəfə 409', async () => {
    const flightId = t.db.prepare(`SELECT flight_id FROM flight_bookings WHERE id = 1`).pluck().get() as number;
    const before = seats(t, flightId);
    const res = await t.api().delete('/api/v1/flights/bookings/1').set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'cancelFlightBooking');
    expect(res.body.status).toBe('CANCELLED');
    expect(seats(t, flightId)).toBe(before + 2);
    expect(t.db.prepare(`SELECT COUNT(*) FROM flight_bookings WHERE id = 1`).pluck().get()).toBe(1); // sətir silinməyib

    const again = await t.api().delete('/api/v1/flights/bookings/1').set(bearer(t.student));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('BOOKING_ALREADY_CANCELLED');
  });
});
