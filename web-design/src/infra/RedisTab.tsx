// Redis: statistika (hit/miss), keş sınağı (X-Cache MISS → HIT), açarlar + TTL (canlı), redis-cli konsolu.
import { useRef, useState, type FormEvent } from "react";
import { infra, type CacheProbe, type RedisKey, type RedisStats } from "../lib/infra";
import { ErrorLine, Panel, errorText, usePolling, type T } from "./shared";

export default function RedisTab({ t, username }: { t: T; username: string }) {
  const [pattern, setPattern] = useState("*");
  const [keys, setKeys] = useState<RedisKey[]>([]);
  const [stats, setStats] = useState<RedisStats | null>(null);
  const [error, setError] = useState("");
  const [probes, setProbes] = useState<CacheProbe[]>([]);
  const [line, setLine] = useState("");
  const [history, setHistory] = useState<{ command: string; output: string; ok: boolean }[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  const load = () => {
    infra
      .redisKeys(pattern || "*")
      .then((data) => {
        setKeys(data.items);
        setStats(data.stats);
        setError("");
      })
      .catch((caught) => setError(errorText(caught)));
  };
  usePolling(load, 2000, [pattern]);

  const probe = async () => {
    try {
      const first = await infra.probeRates();
      const second = await infra.probeRates();
      setProbes([first, second]);
      load();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const run = async (command: string) => {
    if (!command.trim()) return;
    try {
      const res = await infra.redisCommand(command);
      setHistory((h) => [...h.slice(-30), { command, output: res.display, ok: true }]);
    } catch (caught) {
      setHistory((h) => [...h.slice(-30), { command, output: `(error) ${errorText(caught)}`, ok: false }]);
    }
    setLine("");
    load();
    window.setTimeout(() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight }), 0);
  };

  const own = `sandbox:${username}:`;
  const suggestions = ["KEYS *", "TTL cache:rates:AZN:latest", `SET ${own}salam "dünya" EX 60`, `GET ${own}salam`, `INCR ${own}sayğac`, `TTL ${own}salam`, "GET stats:events:card.blocked", "FLUSHALL"];

  return (
    <div className="infra-grid">
      {stats && (
        <div aria-live="polite" className="infra-stats">
          <div><strong>{stats.keys}</strong><span>{t.keys}</span></div>
          <div><strong>{stats.hitRate}%</strong><span>{t.hitRate}</span></div>
          <div><strong>{stats.hits} / {stats.misses}</strong><span>{t.hitsMisses}</span></div>
          <div><strong>{stats.expired}</strong><span>{t.expired}</span></div>
        </div>
      )}

      <Panel title={t.cacheTest}>
        <p className="infra-muted">{t.cacheTestHint}</p>
        <button className="infra-button" onClick={() => void probe()} type="button">{t.sendTwice}</button>
        {probes.length > 0 && (
          <ol className="infra-probes">
            {probes.map((p, i) => (
              <li key={i}>
                <code>GET /api/v1/currencies/rates?base=AZN</code>
                <span className={p.cache === "HIT" ? "infra-badge hit" : "infra-badge miss"}>X-Cache: {p.cache}</span>
                <span>{p.time} ms</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel live={t.live} title={t.keys}>
        <label className="infra-field">
          <span>{t.pattern}</span>
          <input onChange={(event) => setPattern(event.target.value)} spellCheck={false} value={pattern} />
        </label>
        <ErrorLine error={error} />
        {keys.length === 0 ? (
          <p className="infra-muted">{t.noKeys}</p>
        ) : (
          <div className="infra-table-wrap">
            <table className="infra-table">
              <thead>
                <tr><th scope="col">{t.key}</th><th scope="col">{t.ttl}</th><th scope="col">{t.value}</th></tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.key}>
                    <td><code>{k.key}</code></td>
                    <td className={k.ttl >= 0 && k.ttl <= 10 ? "ttl-low" : ""}>{k.ttl === -1 ? t.noTtl : `${k.ttl}s`}</td>
                    <td><code className="infra-value">{k.value}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t.console}>
        <p className="infra-muted">{t.consoleHint(username)}</p>
        <div className="infra-suggestions">
          {suggestions.map((s) => (
            <button key={s} onClick={() => void run(s)} type="button"><code>{s}</code></button>
          ))}
        </div>
        <div aria-live="polite" className="infra-console" ref={outputRef}>
          {history.map((h, i) => (
            <div key={i}>
              <div className="prompt">127.0.0.1:6379&gt; {h.command}</div>
              <pre className={h.ok ? "" : "bad"}>{h.output}</pre>
            </div>
          ))}
        </div>
        <form
          className="infra-console-input"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(line);
          }}
        >
          <label className="sr-only" htmlFor="redis-command">{t.console}</label>
          <input autoComplete="off" id="redis-command" onChange={(event) => setLine(event.target.value)} placeholder={`GET ${own}salam`} spellCheck={false} value={line} />
          <button className="infra-button" type="submit">{t.run}</button>
        </form>
      </Panel>
    </div>
  );
}
