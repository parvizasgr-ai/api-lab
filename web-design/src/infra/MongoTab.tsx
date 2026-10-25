// MongoDB: kolleksiyalar, find / countDocuments / aggregate redaktoru (mongosh görünüşü), bildirişlər (Kafka → Mongo).
import { useState, type FormEvent } from "react";
import { infra, parseJson, type MongoCollection, type MongoQuery, type MongoResult, type Notification } from "../lib/infra";
import { ErrorLine, Panel, errorText, pretty, usePolling, type T } from "./shared";

const EXAMPLES: { label: string; query: MongoQuery }[] = [
  { label: "Bakı, rating ≥ 4", query: { collection: "hotel_reviews", operation: "find", filter: { "hotel.city": "Bakı", rating: { $gte: 4 } }, projection: { "hotel.name": 1, rating: 1, text: 1 }, sort: { rating: -1 }, limit: 10 } },
  { label: "pros: hovuz", query: { collection: "hotel_reviews", operation: "find", filter: { pros: "hovuz" }, projection: { "hotel.name": 1, pros: 1 } } },
  { label: "user yoxdur (import)", query: { collection: "hotel_reviews", operation: "find", filter: { user: { $exists: false } }, projection: { source: 1, reviewer: 1, rating: 1 } } },
  { label: "$group: şəhər → orta", query: { collection: "hotel_reviews", operation: "aggregate", pipeline: [{ $group: { _id: "$hotel.city", avgRating: { $avg: "$rating" }, reviews: { $sum: 1 } } }, { $sort: { avgRating: -1 } }] } },
  { label: "$unwind pros", query: { collection: "hotel_reviews", operation: "aggregate", pipeline: [{ $unwind: "$pros" }, { $group: { _id: "$pros", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }] } },
  { label: "countDocuments", query: { collection: "hotel_reviews", operation: "countDocuments", filter: { rating: 5 } } },
  { label: "notifications", query: { collection: "notifications", operation: "find", sort: { createdAt: -1 }, limit: 5 } },
  { label: "$where → 422", query: { collection: "hotel_reviews", operation: "find", filter: { $where: "this.rating > 3" } } },
];

const oneLine = (v: unknown) => (v === undefined ? "" : JSON.stringify(v));

export default function MongoTab({ t }: { t: T }) {
  const [collections, setCollections] = useState<MongoCollection[]>([]);
  const [collection, setCollection] = useState("hotel_reviews");
  const [operation, setOperation] = useState<MongoQuery["operation"]>("find");
  const [filter, setFilter] = useState('{ "rating": { "$gte": 4 } }');
  const [projection, setProjection] = useState('{ "hotel.name": 1, "rating": 1, "text": 1 }');
  const [sort, setSort] = useState('{ "rating": -1 }');
  const [pipeline, setPipeline] = useState("");
  const [limit, setLimit] = useState(20);
  const [result, setResult] = useState<MongoResult | null>(null);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadSide = () => {
    infra.mongoCollections().then(setCollections).catch(() => undefined);
    infra.notifications().then((n) => setNotifications(n.items)).catch(() => undefined);
  };
  usePolling(loadSide, 3000);

  const apply = (q: MongoQuery) => {
    setCollection(q.collection);
    setOperation(q.operation);
    setFilter(oneLine(q.filter));
    setProjection(oneLine(q.projection));
    setSort(oneLine(q.sort));
    setPipeline(q.pipeline ? JSON.stringify(q.pipeline, null, 1) : "");
    setLimit(q.limit ?? 20);
  };

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const query: MongoQuery = { collection, operation, limit };
      if (operation === "aggregate") {
        query.pipeline = (parseJson(pipeline, t.pipeline) as unknown[] | undefined) ?? [];
      } else {
        const f = parseJson(filter, t.filter);
        if (f) query.filter = f as Record<string, unknown>;
        if (operation === "find") {
          const p = parseJson(projection, t.projection);
          const s = parseJson(sort, t.sort);
          if (p) query.projection = p as Record<string, unknown>;
          if (s) query.sort = s as Record<string, unknown>;
        }
      }
      setResult(await infra.mongoQuery(query));
    } catch (caught) {
      setResult(null);
      setError(errorText(caught));
    }
  };

  const markRead = async (id: string) => {
    await infra.markRead(id).catch(() => undefined);
    loadSide();
  };

  return (
    <div className="infra-grid">
      <Panel title={t.collections}>
        <ul className="infra-collections">
          {collections.map((c) => (
            <li key={c.name}>
              <strong><code>{c.name}</code></strong>
              <span>{c.count} {t.documents}{c.scoped ? ` · ${t.onlyYours}` : ""}</span>
              <small>{c.description}</small>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.query}>
        <div aria-label={t.examples} className="infra-suggestions" role="group">
          {EXAMPLES.map((e) => (
            <button key={e.label} onClick={() => apply(e.query)} type="button">{e.label}</button>
          ))}
        </div>
        <form className="infra-form" onSubmit={(event) => void run(event)}>
          <div className="infra-row">
            <label className="infra-field">
              <span>{t.collection}</span>
              <select onChange={(e) => setCollection(e.target.value)} value={collection}>
                <option value="hotel_reviews">hotel_reviews</option>
                <option value="notifications">notifications</option>
              </select>
            </label>
            <label className="infra-field">
              <span>{t.operation}</span>
              <select onChange={(e) => setOperation(e.target.value as MongoQuery["operation"])} value={operation}>
                <option value="find">find</option>
                <option value="countDocuments">countDocuments</option>
                <option value="aggregate">aggregate</option>
              </select>
            </label>
            <label className="infra-field">
              <span>{t.limit}</span>
              <input max={100} min={1} onChange={(e) => setLimit(Number(e.target.value))} type="number" value={limit} />
            </label>
          </div>
          {operation === "aggregate" ? (
            <label className="infra-field"><span>{t.pipeline}</span><textarea onChange={(e) => setPipeline(e.target.value)} rows={6} spellCheck={false} value={pipeline} /></label>
          ) : (
            <label className="infra-field"><span>{t.filter}</span><textarea onChange={(e) => setFilter(e.target.value)} rows={2} spellCheck={false} value={filter} /></label>
          )}
          {operation === "find" && (
            <div className="infra-row">
              <label className="infra-field"><span>{t.projection}</span><input onChange={(e) => setProjection(e.target.value)} spellCheck={false} value={projection} /></label>
              <label className="infra-field"><span>{t.sort}</span><input onChange={(e) => setSort(e.target.value)} spellCheck={false} value={sort} /></label>
            </div>
          )}
          <button className="infra-button" type="submit">{t.run}</button>
        </form>
        <ErrorLine error={error} />
        {result && (
          <div className="infra-result">
            <p className="infra-muted">{t.executed}</p>
            <pre className="infra-shell">{result.executedQuery}</pre>
            <p className="infra-ok" role="status">{t.result(result.operation === "countDocuments" ? result.count : result.documents.length, result.durationMs)}</p>
            <pre className="infra-json">{result.operation === "countDocuments" ? result.count : pretty(result.documents)}</pre>
          </div>
        )}
      </Panel>

      <Panel live={t.live} title={t.notifications}>
        <p className="infra-muted">{t.notificationsHint}</p>
        {notifications.length === 0 ? (
          <p className="infra-muted">{t.noNotifications}</p>
        ) : (
          <ul className="infra-notifications">
            {notifications.map((n) => (
              <li className={n.read ? "read" : ""} key={n._id}>
                <div>
                  <strong>{n.title}</strong>
                  <span>{n.message}</span>
                  <small>{t.fromEvent}: <code>{n.event.topic} P{n.event.partition} @{n.event.offset}</code> · {new Date(n.createdAt).toLocaleTimeString()}</small>
                </div>
                {!n.read && <button className="infra-button secondary" onClick={() => void markRead(n._id)} type="button">{t.markRead}</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
