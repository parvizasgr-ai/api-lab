// Callbox API v2 (developer portal): token endpoint, banking (Bearer), valyuta, reys, otel, kitab — biznes qaydaları.
// Contract (sxem, nümunələr, 401/422/413) contract.test.ts-də avtomatik yoxlanır; burada davranış yoxlanır.
import { describe, expect, it } from 'vitest';
import { createTestApp, expectMatchesSpec } from './helpers.js';

const TOKEN_URL = '/realms/callbox/protocol/openid-connect/token';
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function token(t: ReturnType<typeof createTestApp>, username = 'student', password = `${username}123`) {
  const res = await t.api().post(TOKEN_URL).type('form').send({ grant_type: 'password', client_id: 'callbox-api', username, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { access_token: string; refresh_token: string };
}
const auth = (tok: { access_token: string }) => ({ Authorization: `Bearer ${tok.access_token}` });

describe('v2 token endpoint (OpenID Connect)', () => {
  it('password grant → Keycloak formatı; token bank API-də işləyir; refresh rotation (köhnə refresh → invalid_grant)', async () => {
    const t = createTestApp();
    const res = await t.api().post(TOKEN_URL).type('form').send({ grant_type: 'password', client_id: 'callbox-api', username: 'student', password: 'student123' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'v2Token');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, refresh_expires_in: 604800 });
    expect((await t.api().get('/api/v2/accounts').set(auth(res.body))).status).toBe(200);

    const refreshed = await t.api().post(TOKEN_URL).type('form').send({ grant_type: 'refresh_token', client_id: 'callbox-api', refresh_token: res.body.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refresh_token).not.toBe(res.body.refresh_token);
    const reused = await t.api().post(TOKEN_URL).type('form').send({ grant_type: 'refresh_token', client_id: 'callbox-api', refresh_token: res.body.refresh_token });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe('invalid_grant');
  });

  it('səhv parol → 400 invalid_grant; səhv client → 401 invalid_client; naməlum grant → unsupported_grant_type; JSON body → 400/415', async () => {
    const t = createTestApp();
    const form = (body: Record<string, string>) => t.api().post(TOKEN_URL).type('form').send(body);
    const bad = await form({ grant_type: 'password', client_id: 'callbox-api', username: 'student', password: 'nope' });
    expect([bad.status, bad.body]).toEqual([400, { error: 'invalid_grant', error_description: 'Invalid user credentials' }]);
    expect((await form({ grant_type: 'password', client_id: 'other', username: 'student', password: 'student123' })).body.error).toBe('invalid_client');
    expect((await form({ grant_type: 'client_credentials', client_id: 'callbox-api' })).body.error).toBe('unsupported_grant_type');
    expect((await form({ grant_type: 'password', client_id: 'callbox-api' })).body.error).toBe('invalid_request');
    const json = await t.api().post(TOKEN_URL).send({ grant_type: 'password' });
    expect(json.status).toBeGreaterThanOrEqual(400);
  });

  it('bank API token-siz → 401 + WWW-Authenticate; açıq API-lər token-siz 200', async () => {
    const t = createTestApp();
    const res = await t.api().get('/api/v2/cards');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Bearer');
    for (const url of ['/api/v2/currencies', '/api/v2/airports', '/api/v2/books/12', '/api/v2/exchange-rates?from=USD&to=AZN']) {
      expect((await t.api().get(url)).status, url).toBe(200);
    }
  });
});

describe('v2 banking', () => {
  it('depozit: məbləğ hesabdan çıxılır, çıxarışda DEBIT; vaxtından əvvəl bağlama faizsiz qaytarır; ikinci bağlama 409', async () => {
    const t = createTestApp();
    const h = auth(await token(t));
    const before = (await t.api().get('/api/v2/accounts').set(h)).body.data.find((a: { id: string }) => a.id === 'AZ21NABZ0001').balance;
    const created = await t.api().post('/api/v2/deposits').set(h).send({ sourceAccountId: 'AZ21NABZ0001', amount: 1000, termMonths: 12 });
    expect(created.status).toBe(201);
    expectMatchesSpec(created, 'v2CreateDeposit');
    expect(created.body).toMatchObject({ status: 'ACTIVE', annualRate: 10, principal: 1000, expectedInterest: 100, expectedPayout: 1100, accruedInterest: 0 });
    expect(created.headers.location).toBe(`/api/v2/deposits/${created.body.id}`);

    const after = (await t.api().get('/api/v2/accounts').set(h)).body.data.find((a: { id: string }) => a.id === 'AZ21NABZ0001').balance;
    expect(Math.round((before - after) * 100)).toBe(100_000);
    const statement = await t.api().get('/api/v2/accounts/AZ21NABZ0001/transactions?limit=1').set(h);
    expect(statement.body.data[0]).toMatchObject({ type: 'DEBIT', amount: 1000, depositId: created.body.id });
    expect(statement.body.hasMore).toBe(true);

    const closed = await t.api().post(`/api/v2/deposits/${created.body.id}/close`).set(h);
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ status: 'CLOSED', earlyClosure: true, interestPaid: 0 });
    const restored = (await t.api().get('/api/v2/accounts').set(h)).body.data.find((a: { id: string }) => a.id === 'AZ21NABZ0001').balance;
    expect(restored).toBe(before);
    expect((await t.api().post(`/api/v2/deposits/${created.body.id}/close`).set(h)).body.code).toBe('DEPOSIT_ALREADY_CLOSED');
  });

  it('depozit qaydaları: balans çatmır, minimum, dəstəklənməyən termMonths → 422 (balans dəyişmir); başqasının depoziti → 403', async () => {
    const t = createTestApp();
    const h = auth(await token(t));
    const post = (body: object) => t.api().post('/api/v2/deposits').set(h).send(body);
    expect((await post({ sourceAccountId: 'AZ21NABZ0001', amount: 9_999_999, termMonths: 6 })).body.code).toBe('INSUFFICIENT_FUNDS');
    expect((await post({ sourceAccountId: 'AZ21NABZ0001', amount: 50, termMonths: 6 })).body.code).toBe('AMOUNT_TOO_SMALL');
    expect((await post({ sourceAccountId: 'AZ21NABZ0001', amount: 500, termMonths: 5 })).body.code).toBe('VALIDATION_ERROR');
    expect((await post({ sourceAccountId: 'AZ21NABZ0004', amount: 500, termMonths: 6 })).status).toBe(403); // rauf-un hesabı
    const rauf = auth(await token(t, 'rauf'));
    expect((await t.api().get('/api/v2/deposits/dep_5f2a9c1e7b30').set(rauf)).status).toBe(403);
    expect((await t.api().get('/api/v2/deposits/dep_000000000000').set(rauf)).status).toBe(404);
  });

  it('kart sifarişi: virtual dərhal ACTIVE, fiziki delivery tələb edir; Idempotency-Key təkrar kart yaratmır; blok iki dəfə → 409', async () => {
    const t = createTestApp();
    const h = auth(await token(t));
    const virtual = await t.api().post('/api/v2/cards').set(h).set('Idempotency-Key', 'order-virtual-0001').send({ accountId: 'AZ21NABZ0002', type: 'VIRTUAL', brand: 'VISA', nameOnCard: 'AYSEL MAMMADOVA' });
    expect(virtual.status).toBe(201);
    expect(virtual.body).toMatchObject({ type: 'VIRTUAL', status: 'ACTIVE', currency: 'USD', dailyLimit: 1000, delivery: null });
    const again = await t.api().post('/api/v2/cards').set(h).set('Idempotency-Key', 'order-virtual-0001').send({ accountId: 'AZ21NABZ0002', type: 'VIRTUAL', brand: 'VISA', nameOnCard: 'AYSEL MAMMADOVA' });
    expect(again.body.id).toBe(virtual.body.id);

    const noDelivery = await t.api().post('/api/v2/cards').set(h).send({ accountId: 'AZ21NABZ0001', type: 'PHYSICAL', brand: 'VISA', nameOnCard: 'AYSEL MAMMADOVA' });
    expect(noDelivery.body.code).toBe('DELIVERY_REQUIRED');
    const lower = await t.api().post('/api/v2/cards').set(h).send({ accountId: 'AZ21NABZ0001', type: 'VIRTUAL', brand: 'VISA', nameOnCard: 'aysel' });
    expect(lower.body.code).toBe('VALIDATION_ERROR');
    const physical = await t.api().post('/api/v2/cards').set(h).send({ accountId: 'AZ21NABZ0001', type: 'PHYSICAL', brand: 'MASTERCARD', nameOnCard: 'AYSEL MAMMADOVA', delivery: { method: 'BRANCH', branchCode: 'BR-028' } });
    expect(physical.body.delivery).toMatchObject({ method: 'BRANCH', details: 'BR-028', status: 'IN_PRODUCTION' });

    const block = () => t.api().post(`/api/v2/cards/${physical.body.id}/block`).set(h).send({ reason: 'LOST' });
    expect((await block()).body).toMatchObject({ status: 'BLOCKED', statusReason: 'LOST' });
    expect((await block()).body.code).toBe('CARD_ALREADY_BLOCKED');
    expect((await t.api().get('/api/v2/cards?status=BLOCKED').set(h)).body.data.map((c: { id: number }) => c.id)).toContain(physical.body.id);
  });

  it('BOLA: rauf student-in kartını görə və bloklaya bilməz (403); cards:write olmadan sifariş → 403 INSUFFICIENT_SCOPE', async () => {
    const t = createTestApp();
    const rauf = auth(await token(t, 'rauf'));
    expect((await t.api().get('/api/v2/cards/1').set(rauf)).status).toBe(403);
    const order = await t.api().post('/api/v2/cards').set(rauf).send({ accountId: 'AZ21NABZ0004', type: 'VIRTUAL', brand: 'VISA', nameOnCard: 'RAUF ALIYEV' });
    expect([order.status, order.body.code]).toEqual([403, 'INSUFFICIENT_SCOPE']);
  });
});

describe('v2 açıq API-lər', () => {
  it('məzənnə: from+to+amount → converted; to-suz → bütün valyutalar; gələcək tarix 422; naməlum valyuta 422', async () => {
    const t = createTestApp();
    const one = await t.api().get('/api/v2/exchange-rates').query({ from: 'USD', to: 'AZN', amount: 100 });
    expect(one.status).toBe(200);
    expect(one.body.converted.AZN).toBeCloseTo(one.body.rates.AZN * 100, 2);
    const all = await t.api().get('/api/v2/exchange-rates');
    expect(all.body.base).toBe('AZN');
    expect(Object.keys(all.body.rates).sort()).toEqual(['AED', 'EUR', 'GBP', 'GEL', 'TRY', 'USD']);
    const past = await t.api().get('/api/v2/exchange-rates').query({ from: 'EUR', to: 'USD,AZN', date: day(-2) });
    expect(past.body).toMatchObject({ date: day(-2), requestedDate: day(-2) });
    expect((await t.api().get('/api/v2/exchange-rates').query({ date: day(5) })).body.code).toBe('INVALID_DATE');
    expect((await t.api().get('/api/v2/exchange-rates').query({ to: 'XYZ' })).body.code).toBe('UNSUPPORTED_CURRENCY');
    expect((await t.api().get('/api/v2/exchange-rates').query({ date: '2020-01-01' })).status).toBe(404);
  });

  it('reys: axtarış → bron (PNR, bilet nömrələri, yer sayı azalır, uşaq 75%); yaş uyğunsuzluğu və pasport müddəti → 422', async () => {
    const t = createTestApp();
    const search = await t.api().get('/api/v2/flights/search').query({ origin: 'GYD', destination: 'IST', departureDate: day(3), adults: 1, children: 1 });
    expect(search.status).toBe(200);
    const offer = search.body.data[0];
    expect(offer.price.total).toBeCloseTo(offer.price.adult + offer.price.child, 2);
    const passengers = [
      { type: 'ADULT', firstName: 'Aysel', lastName: 'Mammadova', dateOfBirth: '1998-04-12', gender: 'FEMALE', nationality: 'AZ', passport: { number: 'C12344821', expiryDate: '2035-01-01' } },
      { type: 'CHILD', firstName: 'Murad', lastName: 'Mammadov', dateOfBirth: '2019-08-30', gender: 'MALE', nationality: 'AZ', passport: { number: 'C55501234', expiryDate: '2035-01-01' } },
    ];
    const contact = { email: 'Aysel@Example.com', phone: '+994501234567' };
    const booked = await t.api().post('/api/v2/flights/bookings').send({ flightId: offer.id, passengers, contact });
    expect(booked.status).toBe(201);
    expect(booked.body.pnr).toMatch(/^[A-Z0-9]{6}$/);
    expect(booked.body.passengers.map((p: { ticketNumber: string }) => p.ticketNumber)).toHaveLength(2);
    expect(booked.body.contact.email).toBe('aysel@example.com');
    expect(booked.body.flight.seatsAvailable).toBe(offer.seatsAvailable - 2);
    expect(booked.body.price.total).toBe(offer.price.total);

    const child = { ...passengers[1], dateOfBirth: '2010-01-01' };
    expect((await t.api().post('/api/v2/flights/bookings').send({ flightId: offer.id, passengers: [passengers[0], child], contact })).body.code).toBe('PASSENGER_TYPE_MISMATCH');
    const expired = { ...passengers[0], passport: { number: 'C99999999', expiryDate: day(1) } };
    expect((await t.api().post('/api/v2/flights/bookings').send({ flightId: offer.id, passengers: [expired], contact })).body.code).toBe('PASSPORT_EXPIRED');
    expect((await t.api().post('/api/v2/flights/bookings').send({ flightId: offer.id, passengers: [passengers[1]], contact })).body.code).toBe('ADULT_REQUIRED');
    expect((await t.api().get('/api/v2/flights/search').query({ origin: 'GYD', destination: 'GYD', departureDate: day(3) })).body.code).toBe('SAME_AIRPORT');
  });

  it('otel: axtarış boş otaqları göstərir; bron → axtarışda otaq yox olur; paralel eyni otaq → bir 201, bir 409', async () => {
    const t = createTestApp();
    const q = { city: 'bakı', checkIn: day(25), checkOut: day(28), adults: 2 };
    const search = await t.api().get('/api/v2/hotels/search').query(q);
    expect(search.status).toBe(200);
    const hit = search.body.data.find((r: { hotel: { id: number } }) => r.hotel.id === 1);
    const room = hit.rooms[0];
    expect(room.totalPrice).toBeCloseTo(room.pricePerNight * 3, 2);
    const body = { hotelId: 1, roomId: room.roomId, checkIn: q.checkIn, checkOut: q.checkOut, adults: 2, leadGuest: { firstName: 'Aysel', lastName: 'Mammadova' }, contact: { email: 'aysel@example.com', phone: '+994501234567' } };
    const [a, b] = await Promise.all([t.api().post('/api/v2/hotels/bookings').send(body), t.api().post('/api/v2/hotels/bookings').send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const ok = a.status === 201 ? a : b;
    expect(ok.body).toMatchObject({ nights: 3, status: 'CONFIRMED' });
    expect(ok.body.confirmationNumber).toMatch(/^CBX-[A-Z0-9]{8}$/);
    const again = await t.api().get('/api/v2/hotels/search').query(q);
    const rooms = again.body.data.find((r: { hotel: { id: number } }) => r.hotel.id === 1)?.rooms ?? [];
    expect(rooms.map((r: { roomId: number }) => r.roomId)).not.toContain(room.roomId);
    expect((await t.api().post('/api/v2/hotels/bookings').send({ ...body, roomId: 5 })).body.code).toBe('ROOM_NOT_FOUND');
    expect((await t.api().post('/api/v2/hotels/bookings').send({ ...body, adults: 8 })).body.code).toBe('ROOM_CAPACITY_EXCEEDED');
    expect((await t.api().get('/api/v2/hotels/search').query({ ...q, checkOut: q.checkIn })).body.code).toBe('INVALID_DATES');
  });

  it('kitab: məlumat + rəy xülasəsi; rəylər cursor ilə səhifələnir; olmayan kitab 404', async () => {
    const t = createTestApp();
    const book = await t.api().get('/api/v2/books/12');
    expect(book.body).toMatchObject({ id: 12, object: 'book', reviews: { count: 2 } });
    const first = await t.api().get('/api/v2/books/12/reviews').query({ limit: 1 });
    expect(first.body.hasMore).toBe(true);
    expect(first.body.summary.count).toBe(2);
    const second = await t.api().get('/api/v2/books/12/reviews').query({ limit: 1, startingAfter: first.body.data[0].id });
    expect(second.body.hasMore).toBe(false);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect((await t.api().get('/api/v2/books/999')).body.code).toBe('BOOK_NOT_FOUND');
    expect((await t.api().get('/api/v2/books/12/reviews').query({ startingAfter: 99999 })).body.code).toBe('INVALID_CURSOR');
  });
});
