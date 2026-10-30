// SQL (/sql) — W3Schools üslubunda dərslik + sərbəst redaktor. Solda dərslər, ortada izah / sintaksis / "Özün sına »"
// nümunələri və avtomatik yoxlanan tapşırıq, sağda verilənlər bazası (cədvəllər, sütunlar, sətir sayı).
// Bütün sorğular real PostgreSQL-də read-only rol ilə icra olunur (POST /api/v1/_db/query): SELECT, WHERE, ORDER BY,
// GROUP BY, HAVING, JOIN, DISTINCT, BETWEEN, LIKE, IN, CASE, WITH — icazəlidir; INSERT/UPDATE/DELETE/DROP — 422.
// Dərs URL-də saxlanılır (?lesson=where) — paylaşıla və reload edilə bilər.
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthClientError, handoffs, sql, type DbTable, type SqlResult } from "./lib/api";
import { Markdown } from "./reference/Markdown";
import { compareResults, type Verdict } from "./sql/compare";
import { EDITOR_ID, LESSONS, type Lesson } from "./sql/lessons";

type Language = "az" | "en";

const TEXT = {
  az: {
    kicker: "Data Lab",
    title: "SQL dərsliyi",
    lessons: "Dərslər",
    editor: "SQL Editor (sərbəst)",
    prev: "❮ Əvvəlki",
    next: "Növbəti ❯",
    syntax: "Sintaksis",
    example: "Nümunə",
    tryIt: "Özün sına »",
    run: "İşə sal",
    running: "İcra olunur…",
    rows: (n: number, ms: number, more: boolean) => `${n}${more ? "+" : ""} sətir · ${ms} ms`,
    exercise: "Tapşırıq",
    check: "Yoxla",
    hint: "İpucu",
    showAnswer: "Cavabı göstər",
    correct: "✓ Düzgündür! Növbəti dərsə keçə bilərsiniz.",
    wrong: {
      columns: (e: number, a: number) => `Sütun sayı uyğun deyil: gözlənilir ${e}, sizdə ${a}.`,
      rowCount: (e: number, a: number) => `Sətir sayı uyğun deyil: gözlənilir ${e}, sizdə ${a}. Şərti yoxlayın.`,
      values: () => "Sətir sayı düzgündür, amma dəyərlər fərqlidir — sütunları və şərti yoxlayın.",
      order: () => "Dəyərlər düzgündür, amma sıra fərqlidir — ORDER BY-ı yoxlayın.",
    },
    done: "tamamlandı",
    database: "Verilənlər bazası",
    tables: "Cədvəllər",
    records: "sətir",
    selectAll: "SELECT * →",
    rateLimited: (s: number) => `SQL limiti dolub (20 sorğu/dəq) — ${s} saniyə gözləyin.`,
    allowed: "İcazə var: SELECT, WHERE, ORDER BY, GROUP BY, HAVING, JOIN, DISTINCT, BETWEEN, LIKE, IN, CASE, WITH. Data dəyişən əmrlər (INSERT, UPDATE, DELETE, DROP) bloklanır.",
    readOnly: "Yalnız oxuma (read-only)",
    quick: "Hazır sorğular",
    quickQueries: [
      ["Bütün istifadəçilər", "SELECT id, username, full_name, email, role\nFROM users\nORDER BY id;"],
      ["Aktiv kartlar", "SELECT c.id, c.last4, c.brand, a.currency\nFROM cards c\nJOIN accounts a ON a.id = c.account_id\nWHERE c.status = 'ACTIVE';"],
      ["Son bronlar", "SELECT id, flight_id, passengers, status, created_at\nFROM flight_bookings\nORDER BY created_at DESC\nLIMIT 10;"],
    ] as [string, string][],
    format: "Formatla",
    retry: "Yenidən cəhd et",
    empty: "Sorğunu yazıb İşə sal düyməsini basın — nəticə burada cədvəl kimi görünəcək.",
  },
  en: {
    kicker: "Data Lab",
    title: "SQL Tutorial",
    lessons: "Lessons",
    editor: "SQL Editor (free)",
    prev: "❮ Previous",
    next: "Next ❯",
    syntax: "Syntax",
    example: "Example",
    tryIt: "Try it Yourself »",
    run: "Run",
    running: "Running…",
    rows: (n: number, ms: number, more: boolean) => `${n}${more ? "+" : ""} rows · ${ms} ms`,
    exercise: "Exercise",
    check: "Check",
    hint: "Hint",
    showAnswer: "Show answer",
    correct: "✓ Correct! You can move on to the next lesson.",
    wrong: {
      columns: (e: number, a: number) => `Column count differs: expected ${e}, got ${a}.`,
      rowCount: (e: number, a: number) => `Row count differs: expected ${e}, got ${a}. Check your condition.`,
      values: () => "Row count is right but values differ — check the columns and the condition.",
      order: () => "Values are right but the order differs — check ORDER BY.",
    },
    done: "done",
    database: "Database",
    tables: "Tables",
    records: "rows",
    selectAll: "SELECT * →",
    rateLimited: (s: number) => `SQL rate limit reached (20 queries/min) — wait ${s} seconds.`,
    allowed: "Allowed: SELECT, WHERE, ORDER BY, GROUP BY, HAVING, JOIN, DISTINCT, BETWEEN, LIKE, IN, CASE, WITH. Data-changing statements (INSERT, UPDATE, DELETE, DROP) are blocked.",
    readOnly: "Read-only",
    quick: "Quick queries",
    quickQueries: [
      ["All users", "SELECT id, username, full_name, email, role\nFROM users\nORDER BY id;"],
      ["Active cards", "SELECT c.id, c.last4, c.brand, a.currency\nFROM cards c\nJOIN accounts a ON a.id = c.account_id\nWHERE c.status = 'ACTIVE';"],
      ["Recent bookings", "SELECT id, flight_id, passengers, status, created_at\nFROM flight_bookings\nORDER BY created_at DESC\nLIMIT 10;"],
    ] as [string, string][],
    format: "Format",
    retry: "Retry",
    empty: "Write a query and press Run — the result appears here as a table.",
  },
};
type Text = (typeof TEXT)["az"];

const DONE_KEY = "callbox.sql.done";
const loadDone = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

const formatSql = (q: string) => q.replace(/\s+/g, " ").replace(/ (FROM|WHERE|JOIN|LEFT JOIN|INNER JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET) /gi, "\n$1 ").trim();

function errorOf(err: unknown, t: Text): { code: string; message: string } {
  if (err instanceof AuthClientError) {
    return { code: err.code, message: err.status === 429 ? t.rateLimited(err.retryAfter ?? 60) : err.message };
  }
  return { code: "ERROR", message: String((err as Error)?.message ?? err) };
}

const cell = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v));

function ResultTable({ result, t }: { result: SqlResult; t: Text }) {
  return (
    <div className="sql-results">
      <div className="results-head"><small>{t.rows(result.rows.length, result.durationMs, result.truncated)}</small></div>
      <div aria-label={t.rows(result.rows.length, result.durationMs, result.truncated)} className="table-scroll" role="region" tabIndex={0}>
        <table>
          <thead><tr>{result.columns.map((c, i) => <th key={`${c}-${i}`}>{c}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((row, r) => (
              <tr key={r}>{result.columns.map((c, i) => <td className={row[c] === null ? "null-cell" : undefined} key={i}><code>{cell(row[c])}</code></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// "Özün sına": redaktə olunan SQL + İşə sal + nəticə
function TryIt({ initial, t, label, autoRun = false, big = false }: { initial: string; t: Text; label: string; autoRun?: boolean; big?: boolean }) {
  const [query, setQuery] = useState(initial);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [running, setRunning] = useState(false);
  const ran = useRef(false);

  useEffect(() => setQuery(initial), [initial]);

  const run = async (q = query) => {
    setRunning(true);
    setError(null);
    try {
      setResult(await sql.query(q));
    } catch (err) {
      setResult(null);
      setError(errorOf(err, t));
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (autoRun && !ran.current) {
      ran.current = true;
      void run(initial);
    }
  });

  const lines = Math.max(big ? 10 : 3, query.split("\n").length + 1);
  return (
    <div className={`tryit${big ? " big" : ""}`}>
      <div className="sql-panel-head">
        <span>{label}</span>
        <div>
          <button onClick={() => setQuery(formatSql(query))} type="button">{t.format}</button>
          <button className="tryit-run" disabled={running} onClick={() => void run()} type="button">{running ? t.running : `▶ ${t.run}`}</button>
        </div>
      </div>
      <div className="sql-code-editor">
        <div aria-hidden="true" className="line-numbers">{Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}<br /></span>)}</div>
        <textarea
          aria-label={label}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          rows={lines}
          spellCheck="false"
          value={query}
        />
      </div>
      {error && <div className="sql-error" role="alert"><span>!</span><strong>{error.message}</strong><code>{error.code}</code></div>}
      {result ? <ResultTable result={result} t={t} /> : big && !error ? <p className="tryit-empty">{t.empty}</p> : null}
    </div>
  );
}

function ExerciseBox({ lesson, t, onSolved, solved }: { lesson: Lesson; t: Text; onSolved: () => void; solved: boolean }) {
  const ex = lesson.exercise!;
  const [query, setQuery] = useState(ex.starter ?? "");
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const expected = useRef<SqlResult | null>(null);

  const check = async () => {
    setBusy(true);
    setVerdict(null);
    try {
      const mine = await sql.query(query);
      setResult(mine);
      expected.current ??= await sql.query(ex.solution);
      const v: Verdict = compareResults(expected.current, mine, ex.ordered);
      if (v.ok) {
        setVerdict({ ok: true, text: t.correct });
        onSolved();
      } else {
        setVerdict({ ok: false, text: t.wrong[v.reason](v.expected, v.actual) });
      }
    } catch (err) {
      setResult(null);
      const e = errorOf(err, t);
      setVerdict({ ok: false, text: `${e.code}: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`ex-${lesson.id}`} className={`sql-exercise${solved ? " solved" : ""}`}>
      <h2 id={`ex-${lesson.id}`}>{t.exercise}{solved && <span className="sql-done-badge">✓ {t.done}</span>}</h2>
      <Markdown text={ex.task} />
      <label className="sr-only" htmlFor={`ex-input-${lesson.id}`}>{t.exercise}</label>
      <textarea
        className="sql-exercise-input"
        id={`ex-input-${lesson.id}`}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SELECT ..."
        rows={4}
        spellCheck="false"
        value={query}
      />
      <div className="sql-exercise-actions">
        <button className="sql-btn-primary" disabled={busy || !query.trim()} onClick={() => void check()} type="button">{busy ? t.running : t.check}</button>
        <button className="sql-btn" onClick={() => setShowHint((v) => !v)} type="button">{t.hint}</button>
        <button className="sql-btn" onClick={() => setShowAnswer((v) => !v)} type="button">{t.showAnswer}</button>
      </div>
      {showHint && <p className="sql-hint"><code>{ex.hint}</code></p>}
      {showAnswer && <pre className="sql-syntax"><code>{ex.solution}</code></pre>}
      {verdict && <p className={verdict.ok ? "sql-verdict ok" : "sql-verdict bad"} role="status">{verdict.text}</p>}
      {result && <ResultTable result={result} t={t} />}
    </section>
  );
}

function DatabasePanel({ tables, error, onRetry, t, onSelect }: { tables: DbTable[]; error: string; onRetry: () => void; t: Text; onSelect: (q: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <aside aria-label={t.database} className="schema-panel sql-db-panel">
      <div className="sql-panel-head"><span>{t.database}</span><code>{tables.length}</code></div>
      {error && (
        <div className="sql-error sql-db-error" role="alert">
          <span>!</span>
          <strong>{error}</strong>
          <button className="sql-btn" onClick={onRetry} type="button">{t.retry}</button>
        </div>
      )}
      <ul>
        {tables.map((table) => (
          <li key={table.name}>
            <button aria-expanded={open === table.name} className="sql-db-table" onClick={() => setOpen(open === table.name ? null : table.name)} type="button">
              <span>{table.name}</span>
              <small>{table.rowCount ?? "—"}</small>
            </button>
            {open === table.name && (
              <div className="sql-db-columns">
                {table.columns.map((c) => (
                  <span className={c.hidden ? "hidden-col" : undefined} key={c.name}>
                    {c.primaryKey ? "🔑 " : ""}{c.name} <em>{c.type}</em>
                  </span>
                ))}
                <button onClick={() => onSelect(`SELECT *\nFROM ${table.name}\nLIMIT 20;`)} type="button">{t.selectAll}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

const initialLesson = () => {
  const id = new URLSearchParams(window.location.search).get("lesson");
  return id && (id === EDITOR_ID || LESSONS.some((l) => l.id === id)) ? id : "intro";
};

export default function SqlTutorialPage({ language }: { language: Language }) {
  const t = TEXT[language];
  const [handoff] = useState(() => handoffs.take().sql ?? null); // tapşırıqdan "SQL ilə yoxla"
  const [lessonId, setLessonId] = useState(() => (handoff ? EDITOR_ID : initialLesson()));
  const [editorQuery, setEditorQuery] = useState(handoff ?? TEXT.az.quickQueries[0][1]);
  const [editorKey, setEditorKey] = useState(0);
  const [tables, setTables] = useState<DbTable[]>([]);
  const [schemaError, setSchemaError] = useState("");
  const [done, setDone] = useState<string[]>(loadDone);
  const mainRef = useRef<HTMLElement>(null);

  const loadSchema = () => {
    setSchemaError("");
    sql
      .schema()
      .then(setTables)
      .catch((err) => {
        const e = errorOf(err, t);
        setSchemaError(`${e.code}: ${e.message}`);
      });
  };
  useEffect(loadSchema, []); // yalnız ilk açılışda

  const order = useMemo(() => [...LESSONS.map((l) => l.id), EDITOR_ID], []);
  const index = order.indexOf(lessonId);
  const lesson = LESSONS.find((l) => l.id === lessonId) ?? null;

  const go = (id: string) => {
    setLessonId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("lesson", id);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  const openInEditor = (q: string) => {
    setEditorQuery(q);
    setEditorKey((k) => k + 1);
    go(EDITOR_ID);
  };

  const markDone = (id: string) =>
    setDone((list) => {
      const next = list.includes(id) ? list : [...list, id];
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        // yaddaş bağlıdır — irəliləyiş yalnız bu səhifədə görünür
      }
      return next;
    });

  const titleOf = (id: string) => (id === EDITOR_ID ? t.editor : LESSONS.find((l) => l.id === id)?.title ?? id);
  const pager = (
    <div className="sql-pager">
      <button className="sql-btn-primary" disabled={index <= 0} onClick={() => go(order[index - 1])} type="button">{t.prev}</button>
      <button className="sql-btn-primary" disabled={index >= order.length - 1} onClick={() => go(order[index + 1])} type="button">{t.next}</button>
    </div>
  );
  const groups = [...new Set(LESSONS.map((l) => l.group))];
  const exercises = LESSONS.filter((l) => l.exercise);

  return (
    <div className="sql-tutorial" id="main-content">
      <nav aria-label={t.lessons} className="sql-lesson-nav">
        <div className="sql-nav-head">
          <span className="section-kicker">{t.kicker}</span>
          <strong>{t.title}</strong>
          <small>{exercises.filter((l) => done.includes(l.id)).length}/{exercises.length} {t.exercise.toLowerCase()}</small>
        </div>
        <label className="sql-lesson-select">
          <span className="sr-only">{t.lessons}</span>
          <select onChange={(e) => go(e.target.value)} value={lessonId}>
            {order.map((id) => <option key={id} value={id}>{titleOf(id)}</option>)}
          </select>
        </label>
        <div className="sql-nav-list">
          {groups.map((g) => (
            <div key={g}>
              <span className="sql-nav-group">{g}</span>
              {LESSONS.filter((l) => l.group === g).map((l) => (
                <a aria-current={l.id === lessonId ? "page" : undefined} className={l.id === lessonId ? "active" : ""} href={`?lesson=${l.id}`} key={l.id} onClick={(e) => { e.preventDefault(); go(l.id); }}>
                  {l.title}
                  {done.includes(l.id) && <span aria-label={t.done} className="sql-nav-done">✓</span>}
                </a>
              ))}
            </div>
          ))}
          <span className="sql-nav-group">Alət</span>
          <a aria-current={lessonId === EDITOR_ID ? "page" : undefined} className={lessonId === EDITOR_ID ? "active" : ""} href={`?lesson=${EDITOR_ID}`} onClick={(e) => { e.preventDefault(); go(EDITOR_ID); }}>{t.editor}</a>
        </div>
      </nav>

      <main className="sql-lesson" ref={mainRef}>
        {lesson ? (
          <article>
            <h1>{lesson.title}</h1>
            {pager}
            <hr />
            <Markdown text={lesson.body} />
            {lesson.syntax && (
              <section className="sql-section">
                <h2>{t.syntax}</h2>
                <pre className="sql-syntax"><code>{lesson.syntax}</code></pre>
              </section>
            )}
            {lesson.examples.map((ex, i) => (
              <section className="sql-section sql-example" key={`${lesson.id}-${i}`}>
                <h2>{t.example}{lesson.examples.length > 1 ? ` ${i + 1}` : ""}: {ex.title}</h2>
                {ex.text && <p>{ex.text}</p>}
                <TryIt initial={ex.sql} label={`${t.example} — ${ex.title}`} t={t} />
              </section>
            ))}
            {lesson.exercise && <ExerciseBox key={lesson.id} lesson={lesson} onSolved={() => markDone(lesson.id)} solved={done.includes(lesson.id)} t={t} />}
            <hr />
            {pager}
          </article>
        ) : (
          <article className="sql-editor-page">
            <h1>{t.editor}</h1>
            <p className="sql-allowed"><strong>{t.readOnly}.</strong> {t.allowed}</p>
            <div className="quick-query-row">
              <span>{t.quick}</span>
              {t.quickQueries.map(([label, text]) => <button key={label} onClick={() => openInEditor(text)} type="button">▶ {label}</button>)}
            </div>
            <TryIt autoRun={editorKey > 0} big initial={editorQuery} key={editorKey} label="SQL editor" t={t} />
            {pager}
          </article>
        )}
      </main>

      <DatabasePanel error={schemaError} onRetry={loadSchema} onSelect={openInEditor} t={t} tables={tables} />
    </div>
  );
}
