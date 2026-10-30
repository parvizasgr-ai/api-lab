// Design (/design) — Google Stitch ilə mətndən UI ekranı. Tələbə chat-də ideyanı yazır, server Stitch-də ekran yaradır
// (bir neçə dəqiqə — asinxron iş, 4 saniyədən bir polling), hazır HTML serverdə sanitize olunur və burada
// <iframe sandbox="allow-scripts" src=imzalı-URL> daxilində göstərilir (srcdoc portalın CSP-sini miras alıb Tailwind-i bloklayırdı): Stitch saytına keçid yoxdur, skriptlər Callbox-un
// token/cookie-lərinə çata bilmir (allow-same-origin yoxdur), linklər və formlar heç yerə aparmır.
// Növbəti mesajlar həmin ekranı redaktə edir (Stitch edit_screens).
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AuthClientError, api } from "./lib/http";
import { Markdown } from "./reference/Markdown";

type Language = "az" | "en";
type Device = "MOBILE" | "DESKTOP" | "TABLET";
type Job = {
  id: string;
  sessionId: string;
  kind: "GENERATE" | "EDIT";
  prompt: string;
  deviceType: Device;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  credits: number;
  complexity: "SIMPLE" | "COMPLEX";
  screenId: string | null;
  message: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  hasHtml: boolean;
};
type Session = { id: string; title: string; deviceType: Device; currentScreenId: string | null; createdAt: string; updatedAt: string; messages: Job[] };
type Usage = {
  configured: boolean;
  resetsAtBaku: string;
  user: { used: number; limit: number; remaining: number };
  pool: { usedCredits: number; hardLimit: number; percent: number; warning: boolean; exhausted: boolean };
};

const TEXT = {
  az: {
    kicker: "Google Stitch",
    title: "Design",
    subtitle: "Ekran ideyanı yaz — AI onu dizayn edir. Sonrakı mesajlarla redaktə et.",
    newSession: "Yeni dizayn",
    sessions: "Dizaynlarım",
    noSessions: "Hələ dizayn yoxdur",
    placeholderNew: "Məs.: Bank tətbiqi üçün mobil login ekranı — loqo, e-poçt, parol, “Daxil ol” düyməsi",
    placeholderEdit: "Redaktə istəyi: məs. “Düyməni yaşıl et, altına “Qeydiyyat” linki əlavə et”",
    send: "Göndər",
    generating: "Generasiya edilir, bir neçə dəqiqə çəkə bilər…",
    queued: "Növbədədir…",
    elapsed: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    preview: "Önizləmə",
    emptyPreview: "Dizayn burada görünəcək",
    emptyHint: "Solda ideyanı yaz və göndər. İlk ekran ~1–3 dəqiqə çəkir.",
    devices: { MOBILE: "Mobil", TABLET: "Planşet", DESKTOP: "Desktop" } as Record<Device, string>,
    version: (n: number) => `Versiya ${n}`,
    usageUser: (u: number, l: number) => `Bu gün: ${u}/${l} generasiya`,
    usagePool: (p: number) => `Ortaq hovuz: ${p}%`,
    resets: (t: string) => `Yenilənmə: ${t} (Bakı vaxtı)`,
    poolWarning: "Ortaq günlük kredit hovuzu 80%-i keçib — qənaətlə istifadə edin.",
    notConfigured: "Design bölməsi qoşulmayıb: müəllim serverin .env faylına STITCH_API_KEY əlavə etməlidir.",
    retry: "Yenidən göndər",
    delete: "Sil",
    credits: (c: number) => `≈${c} kredit`,
    kinds: { GENERATE: "Yeni ekran", EDIT: "Redaktə" },
    sandboxNote: "Təhlükəsiz baxış: dizayn izolyasiya olunmuş çərçivədədir, linklər və formlar işləmir.",
    hint: "Enter — göndər, Shift+Enter — yeni sətir",
    examples: ["Fintech dashboard: balans kartı, son əməliyyatlar, xərclər qrafiki", "Aviabilet axtarış ekranı: haradan, haraya, tarix, sərnişin sayı", "Kitab mağazası üçün məhsul səhifəsi"],
  },
  en: {
    kicker: "Google Stitch",
    title: "Design",
    subtitle: "Describe a screen — AI designs it. Refine it with follow-up messages.",
    newSession: "New design",
    sessions: "My designs",
    noSessions: "No designs yet",
    placeholderNew: "E.g. A mobile login screen for a banking app — logo, email, password, “Sign in” button",
    placeholderEdit: "Edit request: e.g. “Make the button green and add a Sign up link”",
    send: "Send",
    generating: "Generating, this can take a few minutes…",
    queued: "Queued…",
    elapsed: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    preview: "Preview",
    emptyPreview: "Your design will appear here",
    emptyHint: "Describe your idea on the left. The first screen takes ~1–3 minutes.",
    devices: { MOBILE: "Mobile", TABLET: "Tablet", DESKTOP: "Desktop" } as Record<Device, string>,
    version: (n: number) => `Version ${n}`,
    usageUser: (u: number, l: number) => `Today: ${u}/${l} generations`,
    usagePool: (p: number) => `Shared pool: ${p}%`,
    resets: (t: string) => `Resets: ${t} (Baku time)`,
    poolWarning: "The shared daily credit pool is above 80% — please use it sparingly.",
    notConfigured: "Design is not connected: the teacher must add STITCH_API_KEY to the server .env file.",
    retry: "Send again",
    delete: "Delete",
    credits: (c: number) => `≈${c} credits`,
    kinds: { GENERATE: "New screen", EDIT: "Edit" },
    sandboxNote: "Safe preview: the design runs in an isolated frame; links and forms are disabled.",
    hint: "Enter to send, Shift+Enter for a new line",
    examples: ["Fintech dashboard: balance card, recent transactions, spending chart", "Flight search screen: from, to, date, passengers", "Product page for a bookstore"],
  },
};

const DEVICE_WIDTH: Record<Device, string> = { MOBILE: "390px", TABLET: "768px", DESKTOP: "100%" };
const active = (j: Job) => j.status === "QUEUED" || j.status === "RUNNING";

function errorText(err: unknown): string {
  return err instanceof AuthClientError ? err.message : String((err as Error)?.message ?? err);
}

export default function DesignPage({ language }: { language: Language }) {
  const t = TEXT[language];
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [draft, setDraft] = useState("");
  const [device, setDevice] = useState<Device>("MOBILE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [html, setHtml] = useState<{ jobId: string; url: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const htmlCache = useRef(new Map<string, string>());
  const chatRef = useRef<HTMLDivElement>(null);

  const loadUsage = useCallback(() => api.get<Usage>("/api/v1/design/usage").then((r) => setUsage(r.data)).catch(() => undefined), []);
  const loadSessions = useCallback(() => api.get<{ items: Session[] }>("/api/v1/design/sessions").then((r) => setSessions(r.data.items)).catch(() => undefined), []);

  useEffect(() => {
    void loadUsage();
    void loadSessions();
  }, [loadUsage, loadSessions]);

  const pending = session?.messages.find(active) ?? null;
  const done = session?.messages.filter((m) => m.status === "SUCCEEDED") ?? [];
  const shownJobId = selectedJob ?? done[done.length - 1]?.id ?? null;

  // Aktiv iş varsa: 4 saniyədən bir statusu soruş (polling); bitəndə sessiyanı yenilə
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(async () => {
      try {
        const job = (await api.get<Job>(`/api/v1/design/jobs/${pending.id}`)).data;
        if (active(job)) {
          setSession((s) => (s ? { ...s, messages: s.messages.map((m) => (m.id === job.id ? job : m)) } : s));
        } else {
          const fresh = (await api.get<Session>(`/api/v1/design/sessions/${pending.sessionId}`)).data;
          setSession(fresh);
          setSelectedJob(null);
          void loadUsage();
          void loadSessions();
        }
      } catch (err) {
        setError(errorText(err));
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [pending, loadUsage, loadSessions]);

  // Geri sayım (gözləmə müddəti)
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);

  // Göstərilən versiyanın HTML-i
  useEffect(() => {
    if (!shownJobId) {
      setHtml(null);
      return;
    }
    const cached = htmlCache.current.get(shownJobId);
    if (cached) {
      setHtml({ jobId: shownJobId, url: cached });
      return;
    }
    api
      .get<{ previewUrl: string }>(`/api/v1/design/jobs/${shownJobId}/html`)
      .then((r) => {
        htmlCache.current.set(shownJobId, r.data.previewUrl); // imzalı URL 1 saat etibarlıdır
        setHtml({ jobId: shownJobId, url: r.data.previewUrl });
      })
      .catch((err) => setError(errorText(err)));
  }, [shownJobId]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, pending?.status]);

  const openSession = async (id: string) => {
    setError(null);
    setSelectedJob(null);
    try {
      const s = (await api.get<Session>(`/api/v1/design/sessions/${id}`)).data;
      setSession(s);
      setDevice(s.deviceType);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const newSession = () => {
    setSession(null);
    setSelectedJob(null);
    setHtml(null);
    setError(null);
  };

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      let current = session;
      if (!current) {
        current = (await api.post<Session>("/api/v1/design/sessions", { title: prompt.slice(0, 60), deviceType: device })).data;
        setSession(current);
      }
      const job = (await api.post<Job>(`/api/v1/design/sessions/${current.id}/messages`, { prompt, deviceType: device })).data;
      setSession({ ...current, messages: [...current.messages, job] });
      setDraft("");
      setNow(Date.now());
      void loadUsage();
      void loadSessions();
    } catch (err) {
      setError(errorText(err));
      void loadUsage();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/v1/design/sessions/${id}`);
      if (session?.id === id) newSession();
      void loadSessions();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const since = (iso: string | null) => Math.max(0, Math.floor((now - Date.parse(iso ?? new Date().toISOString())) / 1000));
  const disabled = usage?.configured === false || usage?.user.remaining === 0 || usage?.pool.exhausted;

  return (
    <main className="design-page" id="main-content">
      <aside aria-label={t.sessions} className="design-sidebar">
        <div className="design-head">
          <span className="section-kicker">{t.kicker}</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        {usage && (
          <div className={`design-usage${usage.pool.warning ? " warn" : ""}`} role="status">
            <div className="design-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (usage.user.used / usage.user.limit) * 100)}%` }} /></div>
            <strong>{t.usageUser(usage.user.used, usage.user.limit)}</strong>
            <span>{t.usagePool(usage.pool.percent)} · {t.resets(usage.resetsAtBaku)}</span>
            {usage.pool.warning && <span className="design-warn">{t.poolWarning}</span>}
          </div>
        )}
        <button className="design-new" onClick={newSession} type="button">＋ {t.newSession}</button>
        <nav className="design-sessions">
          {sessions.length === 0 && <p className="design-muted">{t.noSessions}</p>}
          {sessions.map((s) => (
            <div className={`design-session${session?.id === s.id ? " active" : ""}`} key={s.id}>
              <button aria-current={session?.id === s.id ? "true" : undefined} onClick={() => void openSession(s.id)} type="button">{s.title}</button>
              <button aria-label={`${t.delete}: ${s.title}`} className="design-session-delete" onClick={() => void remove(s.id)} type="button">×</button>
            </div>
          ))}
        </nav>
      </aside>

      <section aria-label="Chat" className="design-chat">
        {usage?.configured === false && <div className="design-error" role="alert">{t.notConfigured}</div>}
        <div aria-live="polite" className="design-messages" ref={chatRef}>
          {!session?.messages.length && (
            <div className="design-examples">
              {t.examples.map((ex) => <button disabled={!!disabled} key={ex} onClick={() => setDraft(ex)} type="button">{ex}</button>)}
            </div>
          )}
          {session?.messages.map((m, i) => (
            <div className="design-turn" key={m.id}>
              <div className="design-msg user">
                <small>{t.kinds[m.kind]} · {t.devices[m.deviceType]} · {t.credits(m.credits)}</small>
                <p>{m.prompt}</p>
              </div>
              {active(m) ? (
                <div className="design-msg ai pending" role="status">
                  <span className="design-spinner" aria-hidden="true" />
                  <div>
                    <strong>{m.status === "QUEUED" ? t.queued : t.generating}</strong>
                    <small>{t.elapsed(since(m.startedAt ?? m.createdAt))}</small>
                  </div>
                </div>
              ) : m.status === "FAILED" ? (
                <div className="design-msg ai failed" role="alert">
                  <strong>{m.error?.code}</strong>
                  <p>{m.error?.message}</p>
                  {i === session.messages.length - 1 && <button disabled={!!disabled} onClick={() => void send(m.prompt)} type="button">{t.retry}</button>}
                </div>
              ) : (
                <button className={`design-msg ai version${shownJobId === m.id ? " shown" : ""}`} onClick={() => setSelectedJob(m.id)} type="button">
                  <strong>✓ {t.version(done.findIndex((d) => d.id === m.id) + 1)}</strong>
                  {m.message && <Markdown text={m.message} />}
                </button>
              )}
            </div>
          ))}
        </div>
        {error && <div className="design-error" role="alert">{error}</div>}
        <form className="design-composer" onSubmit={onSubmit}>
          <div className="design-devices" role="radiogroup" aria-label="Device">
            {(["MOBILE", "TABLET", "DESKTOP"] as Device[]).map((d) => (
              <label className={device === d ? "active" : ""} key={d}>
                <input checked={device === d} name="design-device" onChange={() => setDevice(d)} type="radio" />
                {t.devices[d]}
              </label>
            ))}
          </div>
          <label className="sr-only" htmlFor="design-input">{t.placeholderNew}</label>
          <textarea
            aria-describedby="design-hint"
            disabled={!!disabled}
            id="design-input"
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={session?.currentScreenId ? t.placeholderEdit : t.placeholderNew}
            rows={3}
            value={draft}
          />
          <div className="design-composer-bar">
            <span id="design-hint">{t.hint}</span>
            <button className="design-send" disabled={!draft.trim() || busy || !!pending || !!disabled} type="submit">{t.send}</button>
          </div>
        </form>
      </section>

      <section aria-label={t.preview} className="design-preview">
        <div className="design-preview-bar">
          <strong>{t.preview}</strong>
          {done.length > 1 && (
            <label>
              <span className="sr-only">{t.preview}</span>
              <select onChange={(e) => setSelectedJob(e.target.value)} value={shownJobId ?? ""}>
                {done.map((d, i) => <option key={d.id} value={d.id}>{t.version(i + 1)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="design-stage">
          {html ? (
            <iframe
              className="design-frame"
              key={html.jobId}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts"
              src={html.url}
              style={{ width: DEVICE_WIDTH[done.find((d) => d.id === html.jobId)?.deviceType ?? device] }}
              title={`${t.preview} — ${t.version(done.findIndex((d) => d.id === html.jobId) + 1)}`}
            />
          ) : (
            <div className="design-empty">
              {pending ? <span className="design-spinner large" aria-hidden="true" /> : <span className="design-empty-icon" aria-hidden="true">◫</span>}
              <strong>{pending ? t.generating : t.emptyPreview}</strong>
              <span>{pending ? t.elapsed(since(pending.startedAt ?? pending.createdAt)) : t.emptyHint}</span>
            </div>
          )}
        </div>
        <p className="design-note">{t.sandboxNote}</p>
      </section>
    </main>
  );
}
