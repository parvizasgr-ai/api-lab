// Kafka: hadisə yarat (kart), topic/partition/offset, consumer group lag (canlı), mesajlar, sandbox producer/consumer.
import { useState, type FormEvent } from "react";
import { infra, parseJson, type KafkaMessages, type KafkaOverview, type KafkaPollResult } from "../lib/infra";
import { ErrorLine, Panel, errorText, pretty, usePolling, type T } from "./shared";

export default function KafkaTab({ t }: { t: T }) {
  const [overview, setOverview] = useState<KafkaOverview | null>(null);
  const [topic, setTopic] = useState("bank.cards");
  const [messages, setMessages] = useState<KafkaMessages | null>(null);
  const [error, setError] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    infra.kafkaTopics().then(setOverview).catch((caught) => setError(errorText(caught)));
    infra.kafkaMessages(topic).then(setMessages).catch(() => setMessages(null));
  };
  usePolling(load, 1500, [topic]);

  const makeEvent = async () => {
    try {
      const r = await infra.toggleFirstCard();
      setEventNote(t.eventDone(r.action, r.card));
      setTopic("bank.cards");
      load();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const topics = overview?.topics ?? [];

  return (
    <div className="infra-grid">
      <Panel title={t.flow}>
        <p className="infra-muted">{t.flowText}</p>
        <button className="infra-button" onClick={() => void makeEvent()} type="button">{t.makeEvent}</button>
        {eventNote && <p className="infra-ok" role="status">{eventNote}</p>}
        <ErrorLine error={error} />
      </Panel>

      <Panel live={t.live} title={t.topics}>
        <ul className="infra-topics">
          {topics.map((x) => (
            <li key={x.name}>
              <button aria-pressed={topic === x.name} className={topic === x.name ? "active" : ""} onClick={() => setTopic(x.name)} type="button">
                <strong>{x.name}</strong>
                <span>{x.partitions.length} {t.partitions} · {x.messages} {t.messages}</span>
                <span className="infra-offsets">
                  {x.partitions.map((p) => (
                    <code key={p.partition}>P{p.partition}:{p.endOffset}</code>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.groups}>
        <div className="infra-table-wrap">
          <table className="infra-table">
            <thead>
              <tr><th scope="col">Group</th><th scope="col">Topic</th><th scope="col">Offsets</th><th scope="col">{t.lag}</th></tr>
            </thead>
            <tbody>
              {overview?.consumerGroups.map((g) => (
                <tr key={`${g.groupId}-${g.topic}`}>
                  <td>{g.groupId} {g.service && <span className="infra-badge">{t.service}</span>}</td>
                  <td><code>{g.topic}</code></td>
                  <td><code>{g.partitions.map((p) => `P${p.partition} ${p.committedOffset}/${p.endOffset}`).join(" · ")}</code></td>
                  <td><span className={g.lag > 0 ? "infra-badge miss" : "infra-badge hit"}>{g.lag}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`${t.latest}: ${topic}`}>
        {messages && messages.hiddenCount > 0 && <p className="infra-muted">{t.hidden(messages.hiddenCount)}</p>}
        {!messages || messages.items.length === 0 ? (
          <p className="infra-muted">{t.noMessages}</p>
        ) : (
          <ul className="infra-messages">
            {messages.items.map((m) => {
              const id = `${m.partition}-${m.offset}`;
              const type = (m.value as { type?: string } | null)?.type ?? m.headers["event-type"] ?? "";
              return (
                <li key={id}>
                  <button aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} type="button">
                    <code>P{m.partition} @{m.offset}</code>
                    <span>key={m.key ?? "null"}</span>
                    <strong>{type}</strong>
                    <small>{new Date(m.timestamp).toLocaleTimeString()}</small>
                  </button>
                  {open === id && <pre className="infra-json">{pretty({ headers: m.headers, value: m.value })}</pre>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Sandbox onChange={load} t={t} topicName={overview?.sandboxTopic ?? ""} />
    </div>
  );
}

function Sandbox({ t, topicName, onChange }: { t: T; topicName: string; onChange: () => void }) {
  const [key, setKey] = useState("order-1");
  const [value, setValue] = useState('{ "type": "order.created", "total": 25.5 }');
  const [partition, setPartition] = useState("");
  const [sent, setSent] = useState("");
  const [group, setGroup] = useState("my-service");
  const [max, setMax] = useState(5);
  const [commit, setCommit] = useState(true);
  const [poll, setPoll] = useState<KafkaPollResult | null>(null);
  const [error, setError] = useState("");

  const produce = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const body = parseJson(value, t.valueJson) ?? null;
      const record = await infra.kafkaProduce({ key: key.trim() || null, value: body, ...(partition !== "" ? { partition: Number(partition) } : {}) });
      setSent(t.sent(record.partition, record.offset));
      onChange();
    } catch (caught) {
      setError(errorText(caught));
    }
  };
  const consume = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      setPoll(await infra.kafkaPoll(group.trim(), max, commit));
      onChange();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Panel title={`${t.sandbox}: ${topicName}`}>
      <div className="infra-two">
        <form className="infra-form" onSubmit={(event) => void produce(event)}>
          <h3>{t.producer}</h3>
          <label className="infra-field"><span>{t.keyOptional}</span><input onChange={(e) => setKey(e.target.value)} value={key} /></label>
          <label className="infra-field"><span>{t.valueJson}</span><textarea onChange={(e) => setValue(e.target.value)} rows={3} spellCheck={false} value={value} /></label>
          <label className="infra-field">
            <span>{t.partitionOptional}</span>
            <select onChange={(e) => setPartition(e.target.value)} value={partition}>
              <option value="">{t.auto}</option>
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </label>
          <button className="infra-button" type="submit">{t.send}</button>
          {sent && <p className="infra-ok" role="status">{sent}</p>}
        </form>
        <form className="infra-form" onSubmit={(event) => void consume(event)}>
          <h3>{t.consumer}</h3>
          <label className="infra-field"><span>{t.groupId}</span><input onChange={(e) => setGroup(e.target.value)} value={group} /></label>
          <label className="infra-field"><span>{t.maxRecords}</span><input max={20} min={1} onChange={(e) => setMax(Number(e.target.value))} type="number" value={max} /></label>
          <label className="infra-check"><input checked={commit} onChange={(e) => setCommit(e.target.checked)} type="checkbox" /> {t.commit}</label>
          <button className="infra-button" type="submit">{t.poll}</button>
          {poll && <p className="infra-ok" role="status">{t.pollResult(poll.records.length, poll.lag)}</p>}
          {poll && poll.records.length > 0 && <pre className="infra-json">{pretty(poll.records.map((r) => ({ partition: r.partition, offset: r.offset, key: r.key, value: r.value })))}</pre>}
        </form>
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}
