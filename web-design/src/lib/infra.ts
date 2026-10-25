// Infrastruktur səhifəsi: Redis, Kafka, MongoDB simulyasiyaları (server/src/infra) və bildirişlər.
import { api } from "./http";

export type RedisKey = { key: string; type: string; ttl: number; size: number; value: string };
export type RedisStats = { keys: number; hits: number; misses: number; hitRate: number; commands: number; expired: number };
export type RedisCommandResult = { command: string; result: unknown; display: string; durationMs: number };

export type KafkaPartition = { partition: number; startOffset: number; endOffset: number };
export type KafkaRecord = { topic: string; partition: number; offset: number; key: string | null; value: unknown; headers: Record<string, string>; timestamp: string };
export type KafkaTopic = { name: string; sandbox: boolean; retention: number; partitions: KafkaPartition[]; messages: number };
export type KafkaGroup = { groupId: string; topic: string; service: boolean; partitions: { partition: number; committedOffset: number; endOffset: number; lag: number }[]; lag: number };
export type KafkaOverview = { topics: KafkaTopic[]; consumerGroups: KafkaGroup[]; sandboxTopic: string };
export type KafkaMessages = { topic: string; partitions: KafkaPartition[]; items: KafkaRecord[]; hiddenCount: number };
export type KafkaPollResult = { groupId: string; topic: string; records: KafkaRecord[]; committed: boolean; partitions: KafkaGroup["partitions"]; lag: number };

export type MongoCollection = { name: string; description: string; count: number; scoped: boolean; sampleDocument: Record<string, unknown> | null };
export type MongoQuery = {
  collection: string;
  operation: "find" | "countDocuments" | "aggregate";
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  limit?: number;
  pipeline?: unknown[];
};
export type MongoResult = { collection: string; operation: string; documents: Record<string, unknown>[]; count: number; scoped: boolean; executedQuery: string; durationMs: number };

export type Notification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  event: { eventId: string; topic: string; partition: number; offset: number };
  createdAt: string;
};

export type CacheProbe = { cache: string; key: string; time: number; status: number };

export const infra = {
  redisKeys: async (pattern = "*") => (await api.get<{ items: RedisKey[]; total: number; stats: RedisStats }>(`/api/v1/_redis/keys?pattern=${encodeURIComponent(pattern)}`)).data,
  redisCommand: async (command: string) => (await api.post<RedisCommandResult>("/api/v1/_redis/command", { command })).data,
  // Keşi yoxla: eyni məzənnə sorğusu → X-Cache MISS (DB) / HIT (Redis)
  probeRates: async (base = "AZN"): Promise<CacheProbe> => {
    const started = performance.now();
    const res = await api.get(`/api/v1/currencies/rates?base=${base}`, { apiKey: true });
    return { cache: res.headers.get("x-cache") ?? "?", key: res.headers.get("x-cache-key") ?? "", time: Math.round(performance.now() - started), status: res.status };
  },

  kafkaTopics: async () => (await api.get<KafkaOverview>("/api/v1/_kafka/topics")).data,
  kafkaMessages: async (topic: string, limit = 20) => (await api.get<KafkaMessages>(`/api/v1/_kafka/topics/${encodeURIComponent(topic)}/messages?limit=${limit}`)).data,
  kafkaProduce: async (message: { key?: string | null; value: unknown; partition?: number }) => (await api.post<KafkaRecord>("/api/v1/_kafka/sandbox/messages", message)).data,
  kafkaPoll: async (groupId: string, maxRecords: number, commit: boolean) =>
    (await api.post<KafkaPollResult>(`/api/v1/_kafka/sandbox/consumer-groups/${encodeURIComponent(groupId)}/poll`, { maxRecords, commit })).data,

  mongoCollections: async () => (await api.get<{ items: MongoCollection[] }>("/api/v1/_mongo/collections")).data.items,
  mongoQuery: async (query: MongoQuery) => (await api.post<MongoResult>("/api/v1/_mongo/query", query)).data,

  notifications: async () => (await api.get<{ items: Notification[]; unreadCount: number }>("/api/v1/notifications?limit=20")).data,
  markRead: async (id: string, read = true) => (await api.patch<Notification>(`/api/v1/notifications/${id}`, { read })).data,

  // Kafka hadisəsi yaratmaq üçün: ilk kartı blokla (ACTIVE) və ya blokdan çıxar (BLOCKED)
  toggleFirstCard: async () => {
    const cards = (await api.get<{ items: { id: number; status: string; maskedNumber: string }[] }>("/api/v1/cards")).data.items;
    const card = cards.find((c) => c.status === "ACTIVE") ?? cards.find((c) => c.status === "BLOCKED");
    if (!card) throw new Error("Kart tapılmadı");
    if (card.status === "ACTIVE") await api.post(`/api/v1/cards/${card.id}/block`, { reason: "LOST" });
    else await api.post(`/api/v1/cards/${card.id}/unblock`, {});
    return { card: card.maskedNumber, action: card.status === "ACTIVE" ? "card.blocked" : "card.unblocked" };
  },
};

// JSON mətnini təhlükəsiz oxu: boş → undefined, səhv → Error (istifadəçiyə göstərilir)
export function parseJson(text: string, what: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${what}: JSON yanlışdır — ${(err as Error).message}`, { cause: err });
  }
}
