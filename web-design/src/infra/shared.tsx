// Infrastruktur səhifəsinin ortaq hissələri: mətnlər (AZ/EN), panel, xəta sətri, polling.
import { useEffect, type ReactNode } from "react";

export const TEXT = {
  az: {
    kicker: "REDIS · KAFKA · MONGODB",
    title: "Infrastruktur",
    subtitle: "API-nin arxasında işləyən keş, hadisə axını və sənəd bazası. Sorğu göndərin — nəticəni burada canlı görün.",
    simNote: "Tədris simulyasiyası: real Redis/Kafka/MongoDB-nin əsas davranışı server daxilində təkrarlanır.",
    tabs: { redis: "Redis — keş", kafka: "Kafka — hadisələr", mongo: "MongoDB — sənədlər" },
    live: "Canlı",
    run: "İcra et",
    keys: "Açarlar",
    hitRate: "Hit rate",
    hitsMisses: "Hit / Miss",
    expired: "Vaxtı bitən",
    cacheTest: "Keşi sına",
    cacheTestHint: "Eyni məzənnə sorğusunu iki dəfə göndərir: birinci MISS (DB), ikinci HIT (Redis). 60 saniyə sonra açar silinir.",
    sendTwice: "2 dəfə göndər",
    pattern: "Pattern",
    key: "Açar",
    ttl: "TTL",
    value: "Dəyər",
    noTtl: "vaxtsız",
    noKeys: "Açar yoxdur. Məzənnə və ya reys axtarışı sorğusu göndərin.",
    console: "redis-cli konsolu",
    consoleHint: (u: string) => `Oxu: istənilən açar. Yazma: yalnız sandbox:${u}:*`,
    flow: "API → topic → consumer group → nəticə",
    flowText: "Kartı bloklayanda bank.cards topic-inə hadisə düşür; notification-service onu oxuyub MongoDB-yə bildiriş yazır, analytics-service Redis-də sayğacı artırır.",
    makeEvent: "Hadisə yarat (kartı blokla / aç)",
    eventDone: (a: string, c: string) => `${a} → ${c}. Consumer ≈1.5 san sonra emal edəcək — lag-a baxın.`,
    topics: "Topic-lər",
    partitions: "partition",
    messages: "mesaj",
    groups: "Consumer group-lar",
    lag: "Lag",
    service: "servis",
    latest: "Son mesajlar",
    hidden: (n: number) => `${n} mesaj başqa istifadəçilərə aiddir — göstərilmir`,
    noMessages: "Mesaj yoxdur.",
    sandbox: "Öz sandbox topic-iniz",
    producer: "Producer",
    keyOptional: "Key (könüllü)",
    valueJson: "Value (JSON)",
    partitionOptional: "Partition",
    auto: "avtomatik (key hash)",
    send: "Göndər",
    sent: (p: number, o: number) => `Yazıldı: partition ${p}, offset ${o}`,
    consumer: "Consumer",
    groupId: "Group ID",
    maxRecords: "Maks. mesaj",
    commit: "Offset-i commit et",
    poll: "Poll",
    pollResult: (n: number, lag: number) => `${n} mesaj oxundu · qalan lag: ${lag}`,
    collections: "Kolleksiyalar",
    documents: "sənəd",
    onlyYours: "yalnız sizinkilər",
    query: "Sorğu",
    examples: "Nümunələr",
    collection: "Kolleksiya",
    operation: "Əməliyyat",
    filter: "Filter (JSON)",
    projection: "Projection (JSON)",
    sort: "Sort (JSON)",
    pipeline: "Pipeline (JSON massiv)",
    limit: "Limit",
    executed: "İcra olunan sorğu (mongosh)",
    result: (n: number, ms: number) => `${n} nəticə · ${ms} ms`,
    notifications: "Bildirişlərim",
    notificationsHint: "Kafka consumer-i yaradır. Kartı bloklayın və ya köçürmə edin — 1–2 saniyə sonra burada görünəcək.",
    markRead: "Oxundu",
    noNotifications: "Bildiriş yoxdur.",
    fromEvent: "Hadisə",
  },
  en: {
    kicker: "REDIS · KAFKA · MONGODB",
    title: "Infrastructure",
    subtitle: "The cache, event stream and document database behind the API. Send a request — watch the result here live.",
    simNote: "Teaching simulation: the core behaviour of real Redis/Kafka/MongoDB is reproduced inside the server.",
    tabs: { redis: "Redis — cache", kafka: "Kafka — events", mongo: "MongoDB — documents" },
    live: "Live",
    run: "Run",
    keys: "Keys",
    hitRate: "Hit rate",
    hitsMisses: "Hits / Misses",
    expired: "Expired",
    cacheTest: "Try the cache",
    cacheTestHint: "Sends the same rates request twice: first MISS (DB), then HIT (Redis). The key expires after 60 seconds.",
    sendTwice: "Send twice",
    pattern: "Pattern",
    key: "Key",
    ttl: "TTL",
    value: "Value",
    noTtl: "no expiry",
    noKeys: "No keys. Send a rates or flight search request.",
    console: "redis-cli console",
    consoleHint: (u: string) => `Read: any key. Write: only sandbox:${u}:*`,
    flow: "API → topic → consumer group → result",
    flowText: "Blocking a card puts an event on bank.cards; notification-service writes a notification to MongoDB, analytics-service increments a Redis counter.",
    makeEvent: "Create an event (block / unblock card)",
    eventDone: (a: string, c: string) => `${a} → ${c}. The consumer processes it in ≈1.5 s — watch the lag.`,
    topics: "Topics",
    partitions: "partitions",
    messages: "messages",
    groups: "Consumer groups",
    lag: "Lag",
    service: "service",
    latest: "Latest messages",
    hidden: (n: number) => `${n} messages belong to other users — hidden`,
    noMessages: "No messages.",
    sandbox: "Your sandbox topic",
    producer: "Producer",
    keyOptional: "Key (optional)",
    valueJson: "Value (JSON)",
    partitionOptional: "Partition",
    auto: "auto (key hash)",
    send: "Send",
    sent: (p: number, o: number) => `Written: partition ${p}, offset ${o}`,
    consumer: "Consumer",
    groupId: "Group ID",
    maxRecords: "Max records",
    commit: "Commit offset",
    poll: "Poll",
    pollResult: (n: number, lag: number) => `${n} records read · remaining lag: ${lag}`,
    collections: "Collections",
    documents: "documents",
    onlyYours: "yours only",
    query: "Query",
    examples: "Examples",
    collection: "Collection",
    operation: "Operation",
    filter: "Filter (JSON)",
    projection: "Projection (JSON)",
    sort: "Sort (JSON)",
    pipeline: "Pipeline (JSON array)",
    limit: "Limit",
    executed: "Executed query (mongosh)",
    result: (n: number, ms: number) => `${n} results · ${ms} ms`,
    notifications: "My notifications",
    notificationsHint: "Created by a Kafka consumer. Block a card or make a transfer — it appears here in 1–2 seconds.",
    markRead: "Mark read",
    noNotifications: "No notifications.",
    fromEvent: "Event",
  },
};
export type T = (typeof TEXT)["az"];

export const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught));
export const pretty = (v: unknown) => JSON.stringify(v, null, 2);

// Hər N ms yenilə (brauzer tab-ı gizlidirsə sorğu getmir)
export function usePolling(load: () => void, ms: number, deps: unknown[] = []) {
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, ms);
    return () => window.clearInterval(timer);
  }, deps);
}

export function Panel({ title, children, live }: { title: string; children: ReactNode; live?: string }) {
  return (
    <section className="infra-panel">
      <header>
        <h2>{title}</h2>
        {live && <span className="infra-live">{live}</span>}
      </header>
      {children}
    </section>
  );
}

export function ErrorLine({ error }: { error: string }) {
  return error ? (
    <p className="infra-error" role="alert">
      {error}
    </p>
  ) : null;
}
