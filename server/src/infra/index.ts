// Redis + Kafka + MongoDB simulyasiyalarının yığılması və aralarındakı axın:
//
//   API (köçürmə, kart, bron, rəy) ──produce──▶ Kafka topic-ləri
//        │                                        ├─▶ notification-service ──insert──▶ MongoDB notifications
//        │                                        └─▶ analytics-service   ──INCR────▶ Redis stats:events:<tip>
//        └─ keş (məzənnə, reys axtarışı) ◀──────── Redis cache:* (TTL)
//
// Hər app nüsxəsinin öz infra-sı var (testlər bir-birindən təcrid olunur).
import crypto from 'node:crypto';
import type { DB } from '../db.js';
import type { Config } from '../config.js';
import { KafkaSim, type KafkaRecord } from './kafka.js';
import { MongoSim } from './mongo.js';
import { RedisSim } from './redis.js';

export { KafkaSim, MongoSim, RedisSim };

export const TOPICS = {
  transfers: 'bank.transfers',
  cards: 'bank.cards',
  bookings: 'travel.bookings',
  reviews: 'hotel.reviews',
} as const;

export const SERVICE_GROUPS = ['notification-service', 'analytics-service'];
export const COLLECTIONS = { hotelReviews: 'hotel_reviews', notifications: 'notifications' } as const;

export type EventType =
  | 'transfer.completed'
  | 'card.blocked'
  | 'card.unblocked'
  | 'booking.created'
  | 'booking.updated'
  | 'booking.cancelled'
  | 'review.created';

// Hadisə zərfi (event envelope) — bütün topic-lərdə eyni forma
export interface DomainEvent {
  eventId: string;
  type: EventType;
  occurredAt: string;
  userId: number;
  counterpartyUserId?: number | null;
  data: Record<string, unknown>;
}

const PRODUCERS: Record<string, string> = {
  [TOPICS.transfers]: 'bank-service',
  [TOPICS.cards]: 'card-service',
  [TOPICS.bookings]: 'travel-service',
  [TOPICS.reviews]: 'review-service',
};

export class Infra {
  readonly redis: RedisSim;
  readonly kafka: KafkaSim;
  readonly mongo: MongoSim;

  constructor(
    db: DB,
    private config: Config,
  ) {
    const now = () => config.now();
    this.redis = new RedisSim(now);
    this.kafka = new KafkaSim(now);
    this.mongo = new MongoSim(db, now);
    for (const topic of Object.values(TOPICS)) this.kafka.createTopic(topic, 3, 500);

    this.kafka.subscribe('notification-service', [TOPICS.transfers, TOPICS.cards, TOPICS.bookings], (r) => this.notify(r), {
      delayMs: config.infra.consumerDelayMs,
    });
    this.kafka.subscribe('analytics-service', Object.values(TOPICS), async (r) => {
      this.redis.incr(`stats:events:${(r.value as DomainEvent).type}`);
    });
  }

  // Domen hadisəsi → Kafka (key = istifadəçi id-si: eyni istifadəçinin hadisələri eyni partition-da, sıra ilə)
  publish(topic: string, type: EventType, userId: number, data: Record<string, unknown>, counterpartyUserId: number | null = null): KafkaRecord {
    const event: DomainEvent = {
      eventId: crypto.randomUUID(),
      type,
      occurredAt: this.config.now().toISOString(),
      userId,
      ...(counterpartyUserId !== null && counterpartyUserId !== userId ? { counterpartyUserId } : {}),
      data,
    };
    return this.kafka.produce(topic, {
      key: String(userId),
      value: event,
      headers: { 'event-type': type, 'content-type': 'application/json', producer: PRODUCERS[topic] ?? 'api-lab' },
    });
  }

  // notification-service: hadisə → istifadəçiyə bildiriş (MongoDB)
  private async notify(record: KafkaRecord) {
    const event = record.value as DomainEvent;
    const d = event.data;
    const money = (amount: unknown, currency: unknown) => `${Number(amount).toFixed(2)} ${String(currency)}`;
    const notes: { userId: number; type: string; title: string; message: string }[] = [];
    if (event.type === 'transfer.completed') {
      notes.push({ userId: event.userId, type: 'TRANSFER_SENT', title: 'Köçürmə göndərildi', message: `${money(d.amount, d.currency)} → ${String(d.toAccountId)}` });
      if (event.counterpartyUserId) {
        notes.push({ userId: event.counterpartyUserId, type: 'TRANSFER_RECEIVED', title: 'Hesabınıza pul daxil oldu', message: `${money(d.amount, d.currency)} ← ${String(d.fromAccountId)}` });
      }
    }
    if (event.type === 'card.blocked') notes.push({ userId: event.userId, type: 'CARD_BLOCKED', title: 'Kart bloklandı', message: `Kart ${String(d.maskedNumber)} — səbəb: ${String(d.reason)}` });
    if (event.type === 'card.unblocked') notes.push({ userId: event.userId, type: 'CARD_UNBLOCKED', title: 'Kart blokdan çıxarıldı', message: `Kart ${String(d.maskedNumber)} yenidən aktivdir` });
    if (event.type === 'booking.created') notes.push({ userId: event.userId, type: 'BOOKING_CREATED', title: 'Bron təsdiqləndi', message: String(d.summary) });
    if (event.type === 'booking.updated') notes.push({ userId: event.userId, type: 'BOOKING_UPDATED', title: 'Bron dəyişdirildi', message: String(d.summary) });
    if (event.type === 'booking.cancelled') notes.push({ userId: event.userId, type: 'BOOKING_CANCELLED', title: 'Bron ləğv edildi', message: String(d.summary) });
    for (const n of notes) {
      await this.mongo.insertOne(COLLECTIONS.notifications, {
        ...n,
        read: false,
        event: { eventId: event.eventId, topic: record.topic, partition: record.partition, offset: record.offset },
        createdAt: this.config.now().toISOString(),
      });
    }
  }

  // DB reset: keş, sayğaclar və mesajlar silinir (Mongo sənədləri DB ilə birlikdə seed-ə qayıdır)
  async reset() {
    await this.kafka.idle();
    this.kafka.clear();
    this.redis.flushall();
  }
}
