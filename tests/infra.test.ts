// Redis / Kafka / MongoDB — API səviyyəsində: keş, hadisə axını, bildirişlər, rəylər, playground-lar və istifadəçi təcridi.
import { describe, expect, it } from 'vitest';
import { bearer, createTestApp, expectMatchesSpec } from './helpers.js';

const API_KEY = { 'X-API-Key': 'apilab-demo-key-2026' };

async function ctx() {
  const t = createTestApp();
  const student = (await t.login('student')).access_token;
  const rauf = (await t.login('rauf')).access_token;
  return { ...t, student, rauf };
}

describe('Redis keş (cache-aside)', () => {
  it('məzənnə: MISS → HIT, açar və TTL Redis-də; 60 san sonra yenə MISS', async () => {
    const t = await ctx();
    const first = await t.api().get('/api/v1/currencies/rates?base=AZN').set(API_KEY);
    const second = await t.api().get('/api/v1/currencies/rates?base=AZN').set(API_KEY);
    expect([first.headers['x-cache'], second.headers['x-cache']]).toEqual(['MISS', 'HIT']);
    expect(second.headers['x-cache-key']).toBe('cache:rates:AZN:latest');
    expect(second.body).toEqual(first.body);
    expect(t.infra.redis.ttl('cache:rates:AZN:latest')).toBe(60);
    t.clock.advance(60);
    expect((await t.api().get('/api/v1/currencies/rates?base=AZN').set(API_KEY)).headers['x-cache']).toBe('MISS');
  });

  it('reys axtarışı: parametr sırası eyni açar verir; bron keşi silir (seatsLeft köhnə qalmır)', async () => {
    const t = await ctx();
    const date = new Date(t.clock.now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const a = await t.api().get(`/api/v1/flights/search?from=GYD&to=IST&date=${date}`);
    const b = await t.api().get(`/api/v1/flights/search?date=${date}&to=IST&from=GYD`);
    expect([a.status, a.headers['x-cache'], b.headers['x-cache']]).toEqual([200, 'MISS', 'HIT']);
    expectMatchesSpec(b, 'searchFlights');
    const flight = a.body.items.find((f: { seatsLeft: number }) => f.seatsLeft > 0);
    const booked = await t.api().post('/api/v1/flights/bookings').set(bearer(t.student)).send({ flightId: flight.id, passengers: [{ firstName: 'Aysel', lastName: 'Məmmədova' }] });
    expect(booked.status).toBe(201);
    expect(t.infra.redis.keys('cache:flights:*')).toEqual([]);
    const after = await t.api().get(`/api/v1/flights/search?from=GYD&to=IST&date=${date}`);
    expect(after.headers['x-cache']).toBe('MISS');
    expect(after.body.items.find((f: { id: number }) => f.id === flight.id).seatsLeft).toBe(flight.seatsLeft - 1);
  });

  it('rate limit sayğacı Redis-dədir (INCR + EXPIRE)', async () => {
    const t = await ctx();
    await t.api().get('/api/v1/auth/me').set(bearer(t.student));
    const [key] = t.infra.redis.keys('ratelimit:user:1:*');
    expect(Number(t.infra.redis.get(key))).toBeGreaterThanOrEqual(1);
    expect(t.infra.redis.ttl(key)).toBeGreaterThan(0);
  });
});

describe('Kafka hadisələri → consumer-lər → MongoDB / Redis', () => {
  it('kart bloku: bank.cards hadisəsi (key = userId), bildiriş Mongo-da, analytics sayğacı Redis-də', async () => {
    const t = await ctx();
    await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST' });
    await t.infra.kafka.idle();
    const msgs = await t.api().get('/api/v1/_kafka/topics/bank.cards/messages').set(bearer(t.student));
    expect(msgs.status).toBe(200);
    expectMatchesSpec(msgs, 'kafkaMessages');
    expect(msgs.body.items).toHaveLength(1);
    expect(msgs.body.items[0]).toMatchObject({ key: '1', headers: { 'event-type': 'card.blocked', producer: 'card-service' }, value: { type: 'card.blocked', userId: 1, data: { cardId: 1, reason: 'LOST' } } });
    const notes = await t.api().get('/api/v1/notifications').set(bearer(t.student));
    expectMatchesSpec(notes, 'listNotifications');
    expect(notes.body.unreadCount).toBe(1);
    expect(notes.body.items[0]).toMatchObject({ type: 'CARD_BLOCKED', read: false, event: { topic: 'bank.cards', offset: 0 } });
    expect(t.infra.redis.get('stats:events:card.blocked')).toBe('1');
    const topics = await t.api().get('/api/v1/_kafka/topics').set(bearer(t.student));
    expectMatchesSpec(topics, 'kafkaTopics');
    expect(topics.body.consumerGroups.filter((g: { lag: number }) => g.lag > 0)).toEqual([]);
  });

  it('köçürmə: göndərən və alan hər biri öz bildirişini alır; rauf student-in kart hadisəsini görmür', async () => {
    const t = await ctx();
    const res = await t.api().post('/api/v1/transfers').set(bearer(t.student)).set('Idempotency-Key', 'infra-transfer-1')
      .send({ fromAccountId: 'AZ21NABZ0001', toAccountId: 'AZ21NABZ0004', amount: 10, currency: 'AZN' });
    expect(res.status).toBe(201);
    await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST' });
    await t.infra.kafka.idle();
    const raufNotes = (await t.api().get('/api/v1/notifications').set(bearer(t.rauf))).body.items;
    expect(raufNotes.map((n: { type: string }) => n.type)).toEqual(['TRANSFER_RECEIVED']);
    const studentNotes = (await t.api().get('/api/v1/notifications').set(bearer(t.student))).body.items.map((n: { type: string }) => n.type);
    expect(studentNotes.sort()).toEqual(['CARD_BLOCKED', 'TRANSFER_SENT']);
    // rauf köçürməni görür (alan tərəfdir), student-in kart hadisəsini yox
    const raufTransfers = await t.api().get('/api/v1/_kafka/topics/bank.transfers/messages').set(bearer(t.rauf));
    expect(raufTransfers.body.items).toHaveLength(1);
    const raufCards = await t.api().get('/api/v1/_kafka/topics/bank.cards/messages').set(bearer(t.rauf));
    expect(raufCards.body).toMatchObject({ items: [], hiddenCount: 1 });
  });

  it('Idempotency replay hadisəni təkrarlamır', async () => {
    const t = await ctx();
    for (let i = 0; i < 2; i++) await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).set('Idempotency-Key', 'infra-block-1').send({ reason: 'LOST' });
    expect(t.infra.kafka.endOffset('bank.cards', 0) + t.infra.kafka.endOffset('bank.cards', 1) + t.infra.kafka.endOffset('bank.cards', 2)).toBe(1);
  });

  it('PATCH bildiriş: oxundu; başqasının bildirişi 404', async () => {
    const t = await ctx();
    await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST' });
    await t.infra.kafka.idle();
    const id = (await t.api().get('/api/v1/notifications').set(bearer(t.student))).body.items[0]._id;
    expect((await t.api().patch(`/api/v1/notifications/${id}`).set(bearer(t.rauf)).send({ read: true })).status).toBe(404);
    const res = await t.api().patch(`/api/v1/notifications/${id}`).set(bearer(t.student)).send({ read: true });
    expectMatchesSpec(res, 'updateNotification');
    expect(res.body.read).toBe(true);
    expect((await t.api().get('/api/v1/notifications?unread=true').set(bearer(t.student))).body).toMatchObject({ items: [], unreadCount: 0 });
  });

  it('başqasının sandbox topic-i 404, naməlum topic 404', async () => {
    const t = await ctx();
    await t.api().post('/api/v1/_kafka/sandbox/messages').set(bearer(t.rauf)).send({ value: 'salam' });
    expect((await t.api().get('/api/v1/_kafka/topics/sandbox.rauf/messages').set(bearer(t.student))).body.code).toBe('KAFKA_TOPIC_NOT_FOUND');
    expect((await t.api().get('/api/v1/_kafka/topics/bank.loans/messages').set(bearer(t.student))).status).toBe(404);
    const topics = (await t.api().get('/api/v1/_kafka/topics').set(bearer(t.student))).body.topics.map((x: { name: string }) => x.name);
    expect(topics).not.toContain('sandbox.rauf');
  });
});

describe('Kafka sandbox: producer + consumer group', () => {
  it('produce → partition/offset; poll commit=true irəli gedir, commit=false təkrar oxuyur; iki group müstəqil', async () => {
    const t = await ctx();
    for (const n of [1, 2, 3]) {
      const res = await t.api().post('/api/v1/_kafka/sandbox/messages').set(bearer(t.student)).send({ key: 'order', value: { n } });
      expect(res.status).toBe(201);
      expectMatchesSpec(res, 'kafkaProduce');
      expect(res.body).toMatchObject({ topic: 'sandbox.student', offset: n - 1 });
    }
    const poll = (group: string, body: object) => t.api().post(`/api/v1/_kafka/sandbox/consumer-groups/${group}/poll`).set(bearer(t.student)).send(body);
    const peek = await poll('a', { maxRecords: 2, commit: false });
    expectMatchesSpec(peek, 'kafkaPoll');
    expect(peek.body.records.map((r: { value: { n: number } }) => r.value.n)).toEqual([1, 2]);
    expect((await poll('a', { maxRecords: 2 })).body.records.map((r: { value: { n: number } }) => r.value.n)).toEqual([1, 2]);
    const rest = await poll('a', {});
    expect(rest.body).toMatchObject({ records: [{ value: { n: 3 } }], lag: 0 });
    expect((await poll('b', {})).body.records).toHaveLength(3);
    const groups = (await t.api().get('/api/v1/_kafka/topics').set(bearer(t.student))).body.consumerGroups.map((g: { groupId: string }) => g.groupId);
    expect(groups).toEqual(expect.arrayContaining(['a', 'b', 'notification-service']));
  });

  it('böyük mesaj və olmayan partition → 422', async () => {
    const t = await ctx();
    const big = await t.api().post('/api/v1/_kafka/sandbox/messages').set(bearer(t.student)).send({ value: 'x'.repeat(3000) });
    expect(big.status).toBe(422);
    expect((await t.api().post('/api/v1/_kafka/sandbox/messages').set(bearer(t.student)).send({ value: 1, partition: 5 })).status).toBe(422);
  });
});

describe('Redis konsolu (API)', () => {
  it('icazəli əmrlər, sandbox yazma, qadağan əmr 422', async () => {
    const t = await ctx();
    const run = (command: string) => t.api().post('/api/v1/_redis/command').set(bearer(t.student)).send({ command });
    const set = await run('SET sandbox:student:salam "dünya" EX 30');
    expectMatchesSpec(set, 'redisCommand');
    expect(set.body).toMatchObject({ result: 'OK', display: 'OK' });
    expect((await run('TTL sandbox:student:salam')).body.result).toBe(30);
    const blocked = await run('FLUSHALL');
    expect(blocked.status).toBe(422);
    expectMatchesSpec(blocked, 'redisCommand');
    expect(blocked.body.code).toBe('REDIS_COMMAND_NOT_ALLOWED');
    expect((await run('SET cache:rates:AZN:latest x')).body.code).toBe('REDIS_COMMAND_NOT_ALLOWED');
    // rauf student-in açarını görmür
    const keys = await t.api().get('/api/v1/_redis/keys?pattern=sandbox:*').set(bearer(t.rauf));
    expectMatchesSpec(keys, 'redisKeys');
    expect(keys.body.items).toEqual([]);
  });
});

describe('MongoDB: otel rəyləri və sorğu playground-u', () => {
  it('GET rəylər: Mongo sənədləri, statistika, icra olunan sorğu; minRating filteri', async () => {
    const t = await ctx();
    const res = await t.api().get('/api/v1/hotels/1/reviews?sort=-rating');
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listHotelReviews');
    expect(res.body).toMatchObject({ total: 3, storage: 'mongodb', ratingDistribution: { '4': 1, '5': 2 } });
    expect(res.body.query).toContain('db.hotel_reviews.find');
    expect(res.body.items.some((d: { source?: string }) => d.source === 'booking-partner')).toBe(true); // fərqli formalı sənəd
    expect((await t.api().get('/api/v1/hotels/1/reviews?minRating=5')).body.total).toBe(2);
    expect((await t.api().get('/api/v1/hotels/999/reviews')).status).toBe(404);
  });

  it('POST rəy: 201 + Kafka hadisəsi; təkrar 409; validasiya 422', async () => {
    const t = await ctx();
    const body = { rating: 4, title: 'Rahat', text: 'Yaxşı yer idi.', stay: { month: '2026-09', tripType: 'SOLO' }, pros: ['mənzərə'] };
    const res = await t.api().post('/api/v1/hotels/3/reviews').set(bearer(t.student)).send(body);
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createHotelReview');
    expect(res.body).toMatchObject({ hotel: { id: 3 }, user: { username: 'student' }, rating: 4, helpfulVotes: 0 });
    expect(res.body).not.toHaveProperty('cons');
    const reviewEvents = [0, 1, 2].flatMap((p) => t.infra.kafka.read('hotel.reviews', p, 0, 10));
    expect(reviewEvents.map((r) => (r.value as { type: string }).type)).toEqual(['review.created']);
    expect((await t.api().post('/api/v1/hotels/3/reviews').set(bearer(t.student)).send(body)).body.code).toBe('REVIEW_EXISTS');
    expect((await t.api().post('/api/v1/hotels/3/reviews').set(bearer(t.rauf)).send({ ...body, rating: 6 })).status).toBe(422);
    expect((await t.api().post('/api/v1/hotels/3/reviews').send(body)).status).toBe(401);
  });

  it('find/aggregate/countDocuments; executedQuery; $where 422; notifications avtomatik öz istifadəçisinə məhdud', async () => {
    const t = await ctx();
    const q = (body: object, token = t.student) => t.api().post('/api/v1/_mongo/query').set(bearer(token)).send(body);
    const find = await q({ collection: 'hotel_reviews', operation: 'find', filter: { 'hotel.city': 'Bakı', rating: { $gte: 5 } }, projection: { rating: 1 }, sort: { _id: 1 } });
    expectMatchesSpec(find, 'mongoQuery');
    expect(find.body.documents).toEqual([{ _id: '665a00000000000000000001', rating: 5 }, { _id: '665a00000000000000000003', rating: 5 }, { _id: '665a00000000000000000004', rating: 5 }]);
    expect(find.body.executedQuery).toBe('db.hotel_reviews.find({"hotel.city": "Bakı", rating: {$gte: 5}}, {rating: 1}).sort({_id: 1}).limit(20)');
    const agg = await q({ collection: 'hotel_reviews', operation: 'aggregate', pipeline: [{ $group: { _id: null, n: { $sum: 1 } } }] });
    expect(agg.body.documents).toEqual([{ _id: null, n: 16 }]);
    expect((await q({ collection: 'hotel_reviews', operation: 'countDocuments', filter: { user: { $exists: false } } })).body.count).toBe(5);
    const where = await q({ collection: 'hotel_reviews', operation: 'find', filter: { $where: 'sleep(1000)' } });
    expect(where.status).toBe(422);
    expectMatchesSpec(where, 'mongoQuery');
    expect(where.body.code).toBe('MONGO_QUERY_NOT_ALLOWED');
    expect((await q({ collection: 'hotel_reviews', operation: 'aggregate', pipeline: [{ $out: 'x' }] })).body.code).toBe('MONGO_QUERY_NOT_ALLOWED');
    expect((await q({ collection: 'hotel_reviews', operation: 'find', filter: { rating: { $great: 1 } } })).body.code).toBe('MONGO_QUERY_ERROR');
    expect((await q({ collection: 'users', operation: 'find' })).status).toBe(422);

    // student → rauf köçürmə: hər biri 1 bildiriş alır. student-in sorğusu rauf-unkunu GÖRMÜR, hətta filter-də userId: 3 yazsa belə
    await t.api().post('/api/v1/transfers').set(bearer(t.student)).set('Idempotency-Key', 'infra-mongo-1').send({ fromAccountId: 'AZ21NABZ0001', toAccountId: 'AZ21NABZ0004', amount: 5, currency: 'AZN' });
    await t.infra.kafka.idle();
    const mine = await q({ collection: 'notifications', operation: 'find', filter: { $or: [{ userId: 3 }, { userId: 1 }] }, projection: { userId: 1, type: 1, _id: 0 } });
    expect(mine.body).toMatchObject({ documents: [{ userId: 1, type: 'TRANSFER_SENT' }], scoped: true });
    expect(mine.body.executedQuery).toContain('{$and: [{userId: 1}');
    const groupAll = await q({ collection: 'notifications', operation: 'aggregate', pipeline: [{ $group: { _id: '$userId', n: { $sum: 1 } } }] });
    expect(groupAll.body.documents).toEqual([{ _id: 1, n: 1 }]);
    const cols = await t.api().get('/api/v1/_mongo/collections').set(bearer(t.rauf));
    expectMatchesSpec(cols, 'mongoCollections');
    expect(cols.body.items.find((c: { name: string }) => c.name === 'notifications')).toMatchObject({ count: 1, scoped: true });
  });
});

describe('_reset infra-nı da sıfırlayır', () => {
  it('Redis keşi və Kafka mesajları silinir', async () => {
    const t = await ctx();
    await t.api().get('/api/v1/currencies/rates?base=AZN').set(API_KEY);
    await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST' });
    await t.infra.kafka.idle();
    const admin = (await t.login('admin')).access_token;
    expect((await t.api().post('/api/v1/_reset').set(bearer(admin))).status).toBe(200);
    expect(t.infra.redis.keys('cache:*')).toEqual([]);
    expect(t.infra.kafka.endOffset('bank.cards', 1) + t.infra.kafka.endOffset('bank.cards', 0) + t.infra.kafka.endOffset('bank.cards', 2)).toBe(0);
  });
});
