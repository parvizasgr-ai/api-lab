// Infrastruktur playground-ları: Redis (açarlar + redis-cli), Kafka (topic-lər, mesajlar, sandbox producer/consumer),
// MongoDB (kolleksiyalar + find/aggregate). Hamısı Bearer tələb edir.
// Təcrid: tələbə başqa tələbənin datasını görmür — domen hadisələrində yalnız özünə aid mesajlar, sandbox-da yalnız öz
// açarları / topic-i / consumer group-ları, notifications kolleksiyasında yalnız öz bildirişləri. ADMIN və SUPERADMIN hamısını görür.
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError, notFound, unprocessable } from '../../errors.js';
import { isAdminRole } from '../../types.js';
import { COLLECTIONS, SERVICE_GROUPS, type DomainEvent } from '../../infra/index.js';
import type { KafkaRecord } from '../../infra/kafka.js';
import { MongoQueryError, shellJson, type Filter } from '../../infra/mongo.js';
import { RedisCommandError, runCommand } from '../../infra/redisCli.js';

const COLLECTION_INFO: Record<string, string> = {
  [COLLECTIONS.hotelReviews]: 'Otel rəyləri — sənədlərin forması fərqlidir (API rəyləri: user, stay, pros/cons; import edilənlər: source, reviewer, photos)',
  [COLLECTIONS.notifications]: 'Bildirişlər — Kafka consumer-i (notification-service) hadisələrdən yaradır. Siz yalnız özünüzünkünü görürsünüz',
};

const sandboxTopic = (username: string) => `sandbox.${username}`;
const sandboxGroup = (username: string, groupId: string) => `sandbox.${username}.${groupId}`;

export function infraHandlers({ infra, config }: AppContext): Handlers {
  const { redis, kafka, mongo } = infra;
  const limits = config.infra.sandbox;
  const admin = (req: Request) => isAdminRole(req.auth?.role);

  // Domen hadisəsini görə bilərmi? (öz hadisəsi və ya köçürmənin alanı)
  const canSee = (req: Request, record: KafkaRecord) => {
    if (admin(req)) return true;
    if (record.topic.startsWith('sandbox.')) return record.topic === sandboxTopic(req.auth!.username);
    const e = record.value as DomainEvent;
    return e?.userId === req.auth!.userId || e?.counterpartyUserId === req.auth!.userId;
  };
  const topicVisible = (req: Request, name: string) => !name.startsWith('sandbox.') || admin(req) || name === sandboxTopic(req.auth!.username);

  const ensureSandbox = (username: string) => kafka.createTopic(sandboxTopic(username), 2, limits.kafkaRetention);

  return {
    // ---------------------------------------------------------------- Redis
    redisKeys: async (req, res) => {
      const { pattern, limit } = req.valid.query as { pattern: string; limit: number };
      const own = `sandbox:${req.auth!.username}:`;
      const keys = redis.keys(pattern).filter((k) => admin(req) || !k.startsWith('sandbox:') || k.startsWith(own));
      const stats = redis.info();
      const reads = stats.hits + stats.misses;
      res.json({
        items: keys.slice(0, limit).map((key) => {
          const value = redis.get(key) ?? '';
          return { key, type: 'string', ttl: redis.ttl(key), size: value.length, value: value.length > 200 ? `${value.slice(0, 200)}…` : value };
        }),
        total: keys.length,
        stats: { keys: stats.keys, hits: stats.hits, misses: stats.misses, hitRate: reads ? Math.round((stats.hits / reads) * 100) : 0, commands: stats.commands, expired: stats.expired },
      });
    },

    redisCommand: async (req, res) => {
      const command = (req.valid.body as { command: string }).command;
      const started = performance.now();
      try {
        const out = runCommand(redis, command, req.auth!.username, limits);
        res.json({ command, result: out.result, display: out.display, durationMs: Math.round((performance.now() - started) * 100) / 100 });
      } catch (err) {
        if (err instanceof RedisCommandError) throw unprocessable(err.code, err.message, [{ field: '/command', message: command.slice(0, 100) }]);
        throw err;
      }
    },

    // ---------------------------------------------------------------- Kafka
    kafkaTopics: async (req, res) => {
      const topics = kafka
        .listTopics()
        .filter((t) => topicVisible(req, t.name))
        .map((t) => {
          const partitions = t.partitions.map((p, partition) => ({ partition, startOffset: p.startOffset, endOffset: kafka.endOffset(t.name, partition) }));
          return { name: t.name, sandbox: t.name.startsWith('sandbox.'), retention: t.retention, partitions, messages: t.partitions.reduce((n, p) => n + p.records.length, 0) };
        });
      const prefix = `sandbox.${req.auth!.username}.`;
      const consumerGroups = kafka
        .groups()
        .filter((g) => admin(req) || SERVICE_GROUPS.includes(g.groupId) || g.groupId.startsWith(prefix))
        .map((g) => ({ ...g, groupId: !admin(req) && g.groupId.startsWith(prefix) ? g.groupId.slice(prefix.length) : g.groupId, service: SERVICE_GROUPS.includes(g.groupId) }));
      res.json({ topics, consumerGroups, sandboxTopic: sandboxTopic(req.auth!.username) });
    },

    kafkaMessages: async (req, res) => {
      const name = req.valid.params.topic as string;
      const { partition, fromOffset, limit } = req.valid.query as { partition?: number; fromOffset?: number; limit: number };
      if (name === sandboxTopic(req.auth!.username)) ensureSandbox(req.auth!.username);
      const topic = kafka.topic(name);
      if (!topic || !topicVisible(req, name)) throw notFound('KAFKA_TOPIC_NOT_FOUND', `Topic tapılmadı: ${name}`);
      if (partition !== undefined && partition >= topic.partitions.length) {
        throw unprocessable('VALIDATION_ERROR', `Bu topic-də ${topic.partitions.length} partition var (0–${topic.partitions.length - 1})`, [{ field: 'query partition', message: String(partition) }]);
      }
      let range: KafkaRecord[];
      if (partition !== undefined) {
        range = kafka.read(name, partition, fromOffset ?? 0, limit);
      } else {
        // partition verilməyibsə: bütün partition-lardan ən yeni mesajlar (vaxta görə)
        range = topic.partitions
          .flatMap((p) => p.records)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.offset - a.offset)
          .slice(0, admin(req) ? limit : undefined);
      }
      const visible = range.filter((r) => canSee(req, r));
      res.json({
        topic: name,
        partitions: topic.partitions.map((p, i) => ({ partition: i, startOffset: p.startOffset, endOffset: kafka.endOffset(name, i) })),
        items: partition !== undefined ? visible : visible.slice(0, limit),
        hiddenCount: range.length - visible.length,
      });
    },

    kafkaProduce: async (req, res) => {
      const body = req.valid.body as { key?: string | null; value: unknown; partition?: number };
      const bytes = Buffer.byteLength(JSON.stringify(body.value ?? null));
      if (bytes > limits.kafkaValueBytes) {
        throw unprocessable('VALIDATION_ERROR', `Mesaj ən çox ${limits.kafkaValueBytes} bayt ola bilər (${bytes})`, [{ field: '/value', message: `${bytes} bayt` }]);
      }
      const topic = ensureSandbox(req.auth!.username);
      if (body.partition !== undefined && body.partition >= topic.partitions.length) {
        throw unprocessable('VALIDATION_ERROR', `Sandbox topic-də ${topic.partitions.length} partition var`, [{ field: '/partition', message: String(body.partition) }]);
      }
      const record = kafka.produce(topic.name, { key: body.key ?? null, value: body.value, partition: body.partition, headers: { producer: req.auth!.username } });
      res
        .status(201)
        .location(`/api/v1/_kafka/topics/${record.topic}/messages?partition=${record.partition}&fromOffset=${record.offset}`)
        .json(record);
    },

    kafkaPoll: async (req, res) => {
      const groupId = req.valid.params.groupId as string;
      const { maxRecords, commit } = req.valid.body as { maxRecords: number; commit: boolean };
      const username = req.auth!.username;
      const topic = ensureSandbox(username);
      const internal = sandboxGroup(username, groupId);
      if (!kafka.hasGroup(internal) && commit) {
        const mine = kafka.groups().filter((g) => g.groupId.startsWith(`sandbox.${username}.`)).length;
        if (mine >= limits.kafkaGroups) {
          throw unprocessable('VALIDATION_ERROR', `Ən çox ${limits.kafkaGroups} consumer group yarada bilərsiniz`, [{ field: 'path groupId', message: groupId }]);
        }
      }
      // Yeni group ən əvvəldən oxuyur (auto.offset.reset = earliest). Partition-lar növbə ilə.
      const records: KafkaRecord[] = [];
      for (let p = 0; p < topic.partitions.length && records.length < maxRecords; p++) {
        records.push(...kafka.read(topic.name, p, kafka.committed(internal, topic.name, p), maxRecords - records.length));
      }
      if (commit) {
        for (let p = 0; p < topic.partitions.length; p++) {
          const last = records.filter((r) => r.partition === p).at(-1);
          kafka.commit(internal, topic.name, p, last ? last.offset + 1 : kafka.committed(internal, topic.name, p));
        }
      }
      const offsets = topic.partitions.map((_, p) => {
        const read = records.filter((r) => r.partition === p).at(-1);
        const position = read ? read.offset + 1 : kafka.committed(internal, topic.name, p);
        const committedOffset = kafka.committed(internal, topic.name, p);
        return { partition: p, committedOffset, endOffset: kafka.endOffset(topic.name, p), lag: Math.max(0, kafka.endOffset(topic.name, p) - (commit ? committedOffset : position)) };
      });
      res.json({ groupId, topic: topic.name, records, committed: commit, partitions: offsets, lag: offsets.reduce((n, o) => n + o.lag, 0) });
    },

    // ---------------------------------------------------------------- MongoDB
    mongoCollections: async (req, res) => {
      const own = (name: string): Filter => (name === COLLECTIONS.notifications && !admin(req) ? { userId: req.auth!.userId } : {});
      const items = [];
      for (const name of Object.values(COLLECTIONS)) {
        const [sample] = await mongo.find(name, own(name), { sort: { createdAt: -1 }, limit: 1 });
        items.push({ name, description: COLLECTION_INFO[name], count: await mongo.countDocuments(name, own(name)), scoped: Object.keys(own(name)).length > 0, sampleDocument: sample ?? null });
      }
      res.json({ items });
    },

    mongoQuery: async (req, res) => {
      const body = req.valid.body as {
        collection: string;
        operation: 'find' | 'aggregate' | 'countDocuments';
        filter?: Filter;
        projection?: Record<string, unknown>;
        sort?: Record<string, unknown>;
        limit: number;
        pipeline?: unknown[];
      };
      const scoped = body.collection === COLLECTIONS.notifications && !admin(req);
      const scope = { userId: req.auth!.userId };
      const filter = body.filter ?? {};
      const effective = scoped ? { $and: [scope, filter] } : filter;
      const started = performance.now();
      let documents: unknown[] = [];
      let count: number;
      let executedQuery: string;
      try {
        if (body.operation === 'aggregate') {
          if (!body.pipeline) throw new MongoQueryError('aggregate üçün pipeline məcburidir: [{ "$match": {...} }, { "$group": {...} }]');
          const pipeline = scoped ? [{ $match: scope }, ...body.pipeline] : body.pipeline;
          documents = (await mongo.aggregate(body.collection, pipeline)).slice(0, body.limit);
          count = documents.length;
          executedQuery = `db.${body.collection}.aggregate(${shellJson(pipeline)})`;
        } else if (body.operation === 'countDocuments') {
          count = await mongo.countDocuments(body.collection, effective);
          executedQuery = `db.${body.collection}.countDocuments(${shellJson(effective)})`;
        } else {
          documents = await mongo.find(body.collection, effective, { projection: body.projection, sort: body.sort, limit: body.limit });
          count = documents.length;
          executedQuery =
            `db.${body.collection}.find(${shellJson(effective)}${body.projection ? `, ${shellJson(body.projection)}` : ''})` +
            `${body.sort ? `.sort(${shellJson(body.sort)})` : ''}.limit(${body.limit})`;
        }
      } catch (err) {
        if (err instanceof MongoQueryError) {
          throw new ApiError(422, err.notAllowed ? 'MONGO_QUERY_NOT_ALLOWED' : 'MONGO_QUERY_ERROR', err.message, [{ field: body.operation === 'aggregate' ? '/pipeline' : '/filter', message: err.message }]);
        }
        throw err;
      }
      res.json({ collection: body.collection, operation: body.operation, documents, count, scoped, executedQuery, durationMs: Math.round((performance.now() - started) * 100) / 100 });
    },
  };
}

