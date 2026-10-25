// Kafka simulyasiyası (proses daxilində). Real Kafka-nın tədris üçün vacib anlayışları:
//   * topic → partition-lar; hər partition append-only log, mesajın offset-i partition daxilində ardıcıl artır
//   * key → partition (eyni key həmişə eyni partition-a → eyni istifadəçinin hadisələri sıra ilə)
//   * retention: partition-da ən çox N mesaj saxlanılır, köhnələr silinir (startOffset artır, offset-lər dəyişmir)
//   * consumer group: hər partition üçün committed offset; lag = endOffset − committedOffset
// Domen hadisələri (köçürmə, kart, bron) burada yaranır; "notification-service" consumer-i onlardan bildiriş düzəldib MongoDB-yə yazır.
// Yaddaşdadır: server yenidən başlayanda boşalır.

export interface KafkaRecord {
  topic: string;
  partition: number;
  offset: number;
  key: string | null;
  value: unknown;
  headers: Record<string, string>;
  timestamp: string;
}

interface Partition {
  startOffset: number;
  records: KafkaRecord[];
}

interface Topic {
  name: string;
  partitions: Partition[];
  retention: number;
  createdAt: string;
}

type Handler = (record: KafkaRecord) => Promise<void>;

interface Consumer {
  groupId: string;
  topics: string[];
  handler: Handler;
  delayMs: number;
  pending: Promise<void> | null; // planlaşdırılmış və ya gedən emal (idle() bunu gözləyir)
  chain: Promise<void>; // emallar ardıcıl gedir
  errors: number;
}

// murmur2 əvəzinə sadə, deterministik FNV-1a hash — eyni key → eyni partition
export function partitionFor(key: string | null, partitions: number, roundRobin: number): number {
  if (key === null) return roundRobin % partitions;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % partitions;
}

export class KafkaSim {
  private topics = new Map<string, Topic>();
  private offsets = new Map<string, Map<string, number>>(); // groupId → "topic:partition" → committed offset (növbəti oxunacaq)
  private consumers: Consumer[] = [];
  private roundRobin = 0;

  constructor(private now: () => Date) {}

  createTopic(name: string, partitions = 3, retention = 1000): Topic {
    let topic = this.topics.get(name);
    if (!topic) {
      topic = { name, partitions: Array.from({ length: partitions }, () => ({ startOffset: 0, records: [] })), retention, createdAt: this.now().toISOString() };
      this.topics.set(name, topic);
    }
    return topic;
  }

  hasTopic(name: string) {
    return this.topics.has(name);
  }

  topic(name: string): Topic | undefined {
    return this.topics.get(name);
  }

  listTopics(): Topic[] {
    return [...this.topics.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  produce(topicName: string, message: { key?: string | null; value: unknown; headers?: Record<string, string>; partition?: number }): KafkaRecord {
    const topic = this.createTopic(topicName);
    const key = message.key ?? null;
    const partition = message.partition ?? partitionFor(key, topic.partitions.length, this.roundRobin++);
    const p = topic.partitions[partition];
    if (!p) throw new Error(`partition ${partition} yoxdur`);
    const record: KafkaRecord = {
      topic: topicName,
      partition,
      offset: p.startOffset + p.records.length,
      key,
      value: message.value,
      headers: message.headers ?? {},
      timestamp: this.now().toISOString(),
    };
    p.records.push(record);
    if (p.records.length > topic.retention) {
      const drop = p.records.length - topic.retention;
      p.records.splice(0, drop);
      p.startOffset += drop;
    }
    this.wake(topicName);
    return record;
  }

  endOffset(topicName: string, partition: number): number {
    const p = this.topics.get(topicName)?.partitions[partition];
    return p ? p.startOffset + p.records.length : 0;
  }

  read(topicName: string, partition: number, fromOffset: number, limit: number): KafkaRecord[] {
    const p = this.topics.get(topicName)?.partitions[partition];
    if (!p) return [];
    const start = Math.max(fromOffset, p.startOffset) - p.startOffset;
    return p.records.slice(start, start + limit);
  }

  committed(groupId: string, topicName: string, partition: number): number {
    return this.offsets.get(groupId)?.get(`${topicName}:${partition}`) ?? this.topics.get(topicName)?.partitions[partition]?.startOffset ?? 0;
  }

  commit(groupId: string, topicName: string, partition: number, offset: number) {
    let group = this.offsets.get(groupId);
    if (!group) this.offsets.set(groupId, (group = new Map()));
    group.set(`${topicName}:${partition}`, offset);
  }

  hasGroup(groupId: string) {
    return this.offsets.has(groupId);
  }

  // Consumer group-ların vəziyyəti (portal: lag)
  groups(): { groupId: string; topic: string; partitions: { partition: number; committedOffset: number; endOffset: number; lag: number }[]; lag: number }[] {
    const out = [];
    for (const [groupId, map] of this.offsets) {
      const topics = new Set([...map.keys()].map((k) => k.slice(0, k.lastIndexOf(':'))));
      for (const consumer of this.consumers.filter((c) => c.groupId === groupId)) consumer.topics.forEach((t) => topics.add(t));
      for (const topic of [...topics].sort()) {
        const t = this.topics.get(topic);
        if (!t) continue;
        const partitions = t.partitions.map((_, partition) => {
          const endOffset = this.endOffset(topic, partition);
          const committedOffset = this.committed(groupId, topic, partition);
          return { partition, committedOffset, endOffset, lag: Math.max(0, endOffset - committedOffset) };
        });
        out.push({ groupId, topic, partitions, lag: partitions.reduce((n, p) => n + p.lag, 0) });
      }
    }
    return out;
  }

  // Consumer: hər yeni mesajda (delayMs sonra) oxumadığı mesajları ardıcıl emal edir, uğurlu olanda offset commit olunur
  subscribe(groupId: string, topics: string[], handler: Handler, options: { delayMs?: number } = {}) {
    for (const t of topics) {
      this.createTopic(t);
      for (let p = 0; p < this.topics.get(t)!.partitions.length; p++) {
        if (!this.offsets.get(groupId)?.has(`${t}:${p}`)) this.commit(groupId, t, p, this.endOffset(t, p));
      }
    }
    this.consumers.push({ groupId, topics, handler, delayMs: options.delayMs ?? 0, pending: null, chain: Promise.resolve(), errors: 0 });
  }

  // Yeni mesaj → consumer delayMs sonra oyanır (portalda lag bir anlıq görünür, sonra 0 olur)
  private wake(topicName: string) {
    for (const c of this.consumers) {
      if (!c.topics.includes(topicName) || c.pending) continue;
      c.pending = new Promise<void>((resolve) => {
        const run = () => {
          c.pending = null; // emal zamanı gələn yeni mesaj yenidən planlaşdırır
          c.chain = c.chain.then(() => this.drainConsumer(c));
          void c.chain.then(resolve);
        };
        if (c.delayMs > 0) setTimeout(run, c.delayMs).unref?.();
        else queueMicrotask(run);
      });
    }
  }

  private async drainConsumer(c: Consumer) {
    for (const topic of c.topics) {
      const t = this.topics.get(topic);
      if (!t) continue;
      for (let partition = 0; partition < t.partitions.length; partition++) {
        for (;;) {
          const offset = this.committed(c.groupId, topic, partition);
          const [record] = this.read(topic, partition, offset, 1);
          if (!record) break;
          try {
            await c.handler(record);
          } catch (err) {
            c.errors++;
            console.error(`[kafka] ${c.groupId} ${topic}/${partition}@${record.offset}:`, (err as Error).message);
          }
          this.commit(c.groupId, topic, partition, record.offset + 1); // xəta olsa da keçir (dead-letter yoxdur — sadə model)
        }
      }
    }
  }

  // Testlər və reset üçün: bütün consumer-lər işini bitirsin
  async idle(): Promise<void> {
    for (;;) {
      const pending = this.consumers.flatMap((c) => (c.pending ? [c.pending] : []));
      if (!pending.length) {
        await Promise.all(this.consumers.map((c) => c.chain));
        if (!this.consumers.some((c) => c.pending !== null)) return;
        continue;
      }
      await Promise.all(pending);
    }
  }

  // DB reset: bütün mesajlar və offset-lər silinir, topic-lər və consumer-lər qalır
  clear() {
    for (const t of this.topics.values()) for (const p of t.partitions) {
      p.records = [];
      p.startOffset = 0;
    }
    for (const name of [...this.topics.keys()]) if (name.startsWith('sandbox.')) this.topics.delete(name);
    for (const [groupId, map] of this.offsets) {
      if (!this.consumers.some((c) => c.groupId === groupId)) this.offsets.delete(groupId);
      else for (const k of map.keys()) map.set(k, 0);
    }
  }
}
