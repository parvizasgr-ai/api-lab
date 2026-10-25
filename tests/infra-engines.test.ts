// Redis / Kafka / MongoDB simulyasiya mühərriklərinin unit testləri (DB-siz).
import { describe, expect, it } from 'vitest';
import { RedisSim, globToRegExp } from '../server/src/infra/redis.js';
import { KafkaSim, partitionFor } from '../server/src/infra/kafka.js';
import { aggregate, matches, project, sortDocs, MongoQueryError, type Doc } from '../server/src/infra/mongo.js';
import { runCommand, tokenize, RedisCommandError } from '../server/src/infra/redisCli.js';

const clock = () => {
  let now = new Date('2026-10-25T09:00:00Z');
  return { now: () => now, advance: (sec: number) => (now = new Date(now.getTime() + sec * 1000)) };
};

describe('RedisSim', () => {
  it('SET/GET, EX ilə TTL, vaxt keçəndə açar silinir (lazy expiration)', () => {
    const c = clock();
    const r = new RedisSim(c.now);
    r.set('a', '1', { ex: 10 });
    r.set('b', '2');
    expect(r.get('a')).toBe('1');
    expect(r.ttl('a')).toBe(10);
    expect(r.ttl('b')).toBe(-1);
    expect(r.ttl('nope')).toBe(-2);
    c.advance(10);
    expect(r.get('a')).toBeNull();
    expect(r.info().expired).toBe(1);
    expect(r.keys('*')).toEqual(['b']);
  });

  it('INCR: yoxdursa 0-dan, TTL saxlanılır; rəqəm deyilsə xəta', () => {
    const r = new RedisSim(clock().now);
    expect(r.incr('n')).toBe(1);
    r.expire('n', 30);
    expect(r.incr('n', 5)).toBe(6);
    expect(r.ttl('n')).toBe(30);
    r.set('s', 'abc');
    expect(() => r.incr('s')).toThrow(/not an integer/);
  });

  it('cached(): MISS → load, HIT → keşdən; hit/miss statistikası', async () => {
    const r = new RedisSim(clock().now);
    let loads = 0;
    const load = async () => ({ v: ++loads });
    expect(await r.cached('k', 60, load)).toEqual({ value: { v: 1 }, hit: false });
    expect(await r.cached('k', 60, load)).toEqual({ value: { v: 1 }, hit: true });
    expect(r.info()).toMatchObject({ hits: 1, misses: 1 });
  });

  it('glob pattern: *, ?, [ab], \\ escape', () => {
    expect(globToRegExp('cache:*').test('cache:rates:AZN')).toBe(true);
    expect(globToRegExp('h?llo').test('hello')).toBe(true);
    expect(globToRegExp('h[ae]llo').test('hillo')).toBe(false);
    expect(globToRegExp('a\\*b').test('a*b')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('redis-cli əmrləri (icazə siyahısı)', () => {
  const limits = { redisKeys: 3, redisValueChars: 10 };
  const setup = () => {
    const r = new RedisSim(clock().now);
    r.set('cache:x', 'v');
    r.set('sandbox:rauf:secret', 'gizli');
    return r;
  };
  it('tokenizer dırnaqları və escape-i tanıyır', () => {
    expect(tokenize(`SET k "salam dünya" EX 5`)).toEqual(['SET', 'k', 'salam dünya', 'EX', '5']);
    expect(tokenize(`SET k 'a b'`)).toEqual(['SET', 'k', 'a b']);
    expect(() => tokenize('GET "x')).toThrow(RedisCommandError);
  });
  it('oxu istənilən açara, yazma yalnız öz sandbox-a; başqasının sandbox-u gizlidir', () => {
    const r = setup();
    expect(runCommand(r, 'GET cache:x', 'student', limits).display).toBe('"v"');
    expect(runCommand(r, 'SET sandbox:student:a 1 EX 60', 'student', limits).result).toBe('OK');
    expect(runCommand(r, 'INCR sandbox:student:a', 'student', limits).display).toBe('(integer) 2');
    expect(runCommand(r, 'KEYS *', 'student', limits).result).toEqual(['cache:x', 'sandbox:student:a']);
    expect(() => runCommand(r, 'SET cache:x hacked', 'student', limits)).toThrow(/öz açarlarınıza/);
    expect(() => runCommand(r, 'GET sandbox:rauf:secret', 'student', limits)).toThrow(/Başqa istifadəçinin/);
    expect(() => runCommand(r, 'DEL cache:x', 'student', limits)).toThrow(RedisCommandError);
  });
  it('qadağan əmrlər, limitlər və Redis xətaları', () => {
    const r = setup();
    for (const cmd of ['FLUSHALL', 'CONFIG GET *', 'EVAL "return 1" 0', 'SHUTDOWN']) {
      expect(() => runCommand(r, cmd, 'student', limits)).toThrow(expect.objectContaining({ code: 'REDIS_COMMAND_NOT_ALLOWED' }));
    }
    expect(() => runCommand(r, 'SET sandbox:student:v 12345678901', 'student', limits)).toThrow(/10 simvol/);
    expect(() => runCommand(r, 'SET sandbox:student:v 1 EX 999999', 'student', limits)).toThrow(/86400/);
    runCommand(r, 'SET sandbox:student:s abc', 'student', limits);
    expect(() => runCommand(r, 'INCR sandbox:student:s', 'student', limits)).toThrow(expect.objectContaining({ code: 'REDIS_ERROR' }));
    runCommand(r, 'SET sandbox:student:b 1', 'student', limits);
    runCommand(r, 'SET sandbox:student:c 1', 'student', limits);
    expect(() => runCommand(r, 'SET sandbox:student:d 1', 'student', limits)).toThrow(/ən çox 3 açar/);
    expect(() => runCommand(r, 'GET', 'student', limits)).toThrow(/wrong number of arguments/);
  });
});

describe('KafkaSim', () => {
  it('eyni key → eyni partition; offset partition daxilində ardıcıl', () => {
    const k = new KafkaSim(clock().now);
    k.createTopic('t', 3);
    const a = k.produce('t', { key: 'user-1', value: 1 });
    const b = k.produce('t', { key: 'user-1', value: 2 });
    expect(b.partition).toBe(a.partition);
    expect([a.offset, b.offset]).toEqual([0, 1]);
    expect(partitionFor('user-1', 3, 0)).toBe(a.partition);
    expect(k.endOffset('t', a.partition)).toBe(2);
  });

  it('retention: köhnə mesajlar silinir, startOffset artır, offset-lər dəyişmir', () => {
    const k = new KafkaSim(clock().now);
    k.createTopic('r', 1, 3);
    for (let i = 0; i < 5; i++) k.produce('r', { value: i });
    expect(k.topic('r')!.partitions[0].startOffset).toBe(2);
    expect(k.read('r', 0, 0, 10).map((m) => m.offset)).toEqual([2, 3, 4]);
  });

  it('consumer group: emal → commit, lag 0; handler xətası mesajı keçir', async () => {
    const k = new KafkaSim(clock().now);
    const seen: unknown[] = [];
    k.subscribe('svc', ['e'], async (r) => {
      if (r.value === 'bad') throw new Error('boom');
      seen.push(r.value);
    });
    const original = console.error;
    console.error = () => {};
    k.produce('e', { key: 'a', value: 'x' });
    k.produce('e', { key: 'a', value: 'bad' });
    k.produce('e', { key: 'a', value: 'y' });
    await k.idle();
    console.error = original;
    expect(seen).toEqual(['x', 'y']);
    expect(k.groups().find((g) => g.groupId === 'svc')!.lag).toBe(0);
  });

  it('gecikmiş consumer: əvvəl lag > 0, sonra 0', async () => {
    const k = new KafkaSim(clock().now);
    k.subscribe('slow', ['s'], async () => undefined, { delayMs: 30 });
    k.produce('s', { value: 1 });
    expect(k.groups()[0].lag).toBe(1);
    await k.idle();
    expect(k.groups()[0].lag).toBe(0);
  });

  it('clear(): mesajlar və sandbox topic-ləri silinir, servis topic-ləri qalır', () => {
    const k = new KafkaSim(clock().now);
    k.createTopic('bank.cards');
    k.produce('bank.cards', { value: 1 });
    k.createTopic('sandbox.student', 2);
    k.clear();
    expect(k.hasTopic('sandbox.student')).toBe(false);
    expect(k.endOffset('bank.cards', 0) + k.endOffset('bank.cards', 1) + k.endOffset('bank.cards', 2)).toBe(0);
  });
});

describe('Mongo sorğu dili', () => {
  const docs: Doc[] = [
    { _id: 'a', hotel: { city: 'Bakı' }, rating: 5, pros: ['hovuz', 'spa'], user: { id: 1 } },
    { _id: 'b', hotel: { city: 'Bakı' }, rating: 3, pros: ['mərkəz'] },
    { _id: 'c', hotel: { city: 'Qəbələ' }, rating: 4, pros: ['spa'], source: 'import' },
  ];
  const ids = (f: Record<string, unknown>) => docs.filter((d) => matches(d, f)).map((d) => d._id);

  it('müqayisə, iç-içə sahə, massiv, $in, $exists, $regex, $and/$or/$nor, $elemMatch, $not', () => {
    expect(ids({ 'hotel.city': 'Bakı', rating: { $gte: 4 } })).toEqual(['a']);
    expect(ids({ pros: 'spa' })).toEqual(['a', 'c']);
    expect(ids({ pros: { $all: ['hovuz', 'spa'] } })).toEqual(['a']);
    expect(ids({ pros: { $size: 1 } })).toEqual(['b', 'c']);
    expect(ids({ rating: { $in: [3, 4] } })).toEqual(['b', 'c']);
    expect(ids({ user: { $exists: false } })).toEqual(['b', 'c']);
    expect(ids({ 'hotel.city': { $regex: '^q', $options: 'i' } })).toEqual(['c']);
    expect(ids({ $or: [{ rating: 5 }, { source: 'import' }] })).toEqual(['a', 'c']);
    expect(ids({ $nor: [{ rating: 5 }] })).toEqual(['b', 'c']);
    expect(ids({ rating: { $not: { $gt: 3 } } })).toEqual(['b']);
    expect(ids({ rating: { $ne: 5 } })).toEqual(['b', 'c']);
    expect(ids({ rating: { $gt: '3' } })).toEqual([]); // tip fərqli → müqayisə olunmur (Mongo kimi)
  });

  it('təhlükəli və naməlum operatorlar rədd olunur', () => {
    expect(() => matches(docs[0], { $where: 'this.rating > 3' })).toThrow(expect.objectContaining({ notAllowed: true }));
    expect(() => matches(docs[0], { rating: { $function: {} } })).toThrow(MongoQueryError);
    expect(() => matches(docs[0], { rating: { $great: 1 } })).toThrow(/naməlum operator/);
    expect(() => aggregate(docs, [{ $out: 'x' }])).toThrow(expect.objectContaining({ notAllowed: true }));
    expect(() => aggregate(docs, [{ $lookup: {} }])).toThrow(/icazəli deyil/);
  });

  it('projection, sort', () => {
    expect(project(docs[0], { 'hotel.city': 1 })).toEqual({ _id: 'a', hotel: { city: 'Bakı' } });
    expect(project(docs[0], { pros: 0, user: 0, _id: 0 } as never)).toEqual({ hotel: { city: 'Bakı' }, rating: 5 });
    expect(() => project(docs[0], { rating: 1, pros: 0 })).toThrow(/qarışdırıla bilməz/);
    expect(sortDocs(docs, { rating: -1 }).map((d) => d._id)).toEqual(['a', 'c', 'b']);
  });

  it('aggregate: $match, $group ($avg/$sum/$push), $sort, $unwind, $count, $project', () => {
    expect(aggregate(docs, [{ $group: { _id: '$hotel.city', avg: { $avg: '$rating' }, n: { $sum: 1 } } }, { $sort: { avg: -1 } }])).toEqual([
      { _id: 'Bakı', avg: 4, n: 2 },
      { _id: 'Qəbələ', avg: 4, n: 1 },
    ]);
    expect(aggregate(docs, [{ $unwind: '$pros' }, { $group: { _id: '$pros', n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 1 }])).toEqual([{ _id: 'spa', n: 2 }]);
    expect(aggregate(docs, [{ $match: { rating: { $gte: 4 } } }, { $count: 'total' }])).toEqual([{ total: 2 }]);
    expect(aggregate(docs, [{ $project: { _id: 0, city: '$hotel.city' } }, { $limit: 1 }])).toEqual([{ city: 'Bakı' }]);
    expect(() => aggregate(docs, [{ $group: { n: { $sum: 1 } } }])).toThrow(/_id/);
  });
});
