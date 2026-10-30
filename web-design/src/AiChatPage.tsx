// Callbox AI (/ai) — tələbə köməkçisi (Google Gemini). DeepSeek / ChatGPT üslubu: solda söhbətlər (aylara görə), ortada chat.
// Söhbətlər yalnız bu brauzerdə saxlanılır (istifadəçiyə görə ayrıca); hər sorğuda tarixçə serverə göndərilir — server
// onu Gemini-yə ötürür, heç yerdə saxlamır. API key yalnız serverdədir.
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AuthClientError, api } from "./lib/http";
import { Markdown } from "./reference/Markdown";

type Language = "az" | "en";
type Message = { role: "user" | "model"; text: string; at: string; model?: string };
type Chat = { id: string; title: string; createdAt: string; updatedAt: string; messages: Message[] };
type Status = { configured: boolean; model: string; maxChars: number };

const TEXT = {
  az: {
    brand: "Callbox AI",
    newChat: "Yeni söhbət",
    search: "Söhbətlərdə axtar",
    ready: "Hazır olanda yaz",
    subtitle: "API, SQL, autentifikasiya, biznes analiz — istənilən sualı ver.",
    placeholder: "Callbox AI-a yaz…",
    send: "Göndər",
    thinking: "Düşünür…",
    copy: "Kopyala",
    copied: "Kopyalandı",
    retry: "Yenidən cəhd et",
    delete: "Söhbəti sil",
    noChats: "Hələ söhbət yoxdur",
    notConfigured: "Callbox AI hələ qoşulmayıb: müəllim serverin .env faylına GEMINI_API_KEY əlavə etməlidir.",
    rateLimited: (s: number) => `Limit dolub — ${s} saniyə sonra yenidən yaz.`,
    hint: "Enter — göndər, Shift+Enter — yeni sətir",
    disclaimer: "AI səhv edə bilər — vacib məlumatı API Reference və dərs materiallarında yoxla.",
    examples: ["PUT və PATCH fərqi nədir?", "JWT necə işləyir? Sadə izah et", "401 və 403 fərqi nədir?", "Kart bloklama üçün user story yaz"],
    sidebar: "Söhbətlər",
  },
  en: {
    brand: "Callbox AI",
    newChat: "New chat",
    search: "Search chats",
    ready: "Whenever you're ready",
    subtitle: "APIs, SQL, authentication, business analysis — ask anything.",
    placeholder: "Message Callbox AI…",
    send: "Send",
    thinking: "Thinking…",
    copy: "Copy",
    copied: "Copied",
    retry: "Retry",
    delete: "Delete chat",
    noChats: "No chats yet",
    notConfigured: "Callbox AI is not connected yet: the teacher must add GEMINI_API_KEY to the server .env file.",
    rateLimited: (s: number) => `Rate limit reached — try again in ${s} seconds.`,
    hint: "Enter to send, Shift+Enter for a new line",
    disclaimer: "AI can make mistakes — check important details in the API Reference and course materials.",
    examples: ["What is the difference between PUT and PATCH?", "How does JWT work? Explain simply", "401 vs 403?", "Write a user story for blocking a card"],
    sidebar: "Chats",
  },
};

const storageKey = (username: string) => `callbox.ai.chats.${username}`;

function loadChats(username: string): Chat[] {
  try {
    const raw = localStorage.getItem(storageKey(username));
    return raw ? (JSON.parse(raw) as Chat[]) : [];
  } catch {
    return [];
  }
}

function saveChats(username: string, chats: Chat[]) {
  try {
    localStorage.setItem(storageKey(username), JSON.stringify(chats.slice(0, 50)));
  } catch {
    // yaddaş bağlıdır və ya doludur — söhbət yalnız bu səhifədə qalır
  }
}

const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 18);
const titleOf = (text: string) => (text.length > 42 ? `${text.slice(0, 42).trim()}…` : text);

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden="true" className="ai-logo" height={size} viewBox="0 0 32 32" width={size}>
      <rect fill="currentColor" height="32" rx="9" width="32" />
      <path d="M10 12.5 6.5 16l3.5 3.5M22 12.5l3.5 3.5-3.5 3.5M18 10l-4 12" fill="none" stroke="var(--on-accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

function CopyButton({ text, t }: { text: string; t: (typeof TEXT)["az"] }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ai-msg-action"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); })}
      type="button"
    >
      {done ? t.copied : t.copy}
    </button>
  );
}

export default function AiChatPage({ language, username, fullName }: { language: Language; username: string; fullName: string }) {
  const t = TEXT[language];
  const [chats, setChats] = useState<Chat[]>(() => loadChats(username));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const active = chats.find((c) => c.id === activeId) ?? null;
  const maxChars = status?.maxChars ?? 4000;

  useEffect(() => {
    api.get<Status>("/api/v1/ai/status").then((r) => setStatus(r.data)).catch(() => setStatus(null));
  }, []);
  useEffect(() => saveChats(username, chats), [username, chats]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, pending]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  // textarea hündürlüyü mətnə görə (maks. 8 sətir)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q)));
    const map = new Map<string, Chat[]>();
    for (const c of [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const month = c.updatedAt.slice(0, 7);
      map.set(month, [...(map.get(month) ?? []), c]);
    }
    return [...map.entries()];
  }, [chats, query]);

  const ask = async (chatId: string, history: Message[]) => {
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ reply: { text: string }; model: string }>("/api/v1/ai/chat", {
        messages: history.map(({ role, text }) => ({ role, text })),
      });
      const now = new Date().toISOString();
      setChats((all) => all.map((c) => (c.id === chatId ? { ...c, updatedAt: now, messages: [...history, { role: "model", text: res.data.reply.text, at: now, model: res.data.model }] } : c)));
    } catch (err) {
      const e = err instanceof AuthClientError ? err : null;
      if (e?.status === 429) setCooldown(e.retryAfter ?? 30);
      setError({ text: e?.status === 429 ? t.rateLimited(e.retryAfter ?? 30) : e?.code === "AI_NOT_CONFIGURED" ? t.notConfigured : e?.message ?? String(err), retryable: e?.code !== "AI_NOT_CONFIGURED" });
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending || cooldown > 0 || content.length > maxChars) return;
    const now = new Date().toISOString();
    const userMsg: Message = { role: "user", text: content, at: now };
    let chatId = activeId;
    let history: Message[];
    if (!active) {
      chatId = newId();
      history = [userMsg];
      setChats((all) => [{ id: chatId!, title: titleOf(content), createdAt: now, updatedAt: now, messages: history }, ...all]);
      setActiveId(chatId);
    } else {
      history = [...active.messages, userMsg];
      setChats((all) => all.map((c) => (c.id === active.id ? { ...c, updatedAt: now, messages: history } : c)));
    }
    setDraft("");
    void ask(chatId!, history);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };
  const retry = () => {
    if (!active) return;
    const history = active.messages[active.messages.length - 1]?.role === "user" ? active.messages : active.messages.slice(0, -1);
    void ask(active.id, history);
  };
  const newChat = () => {
    setActiveId(null);
    setError(null);
    setDraft("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  };
  const remove = (id: string) => {
    setChats((all) => all.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };

  const composer = (
    <form className="ai-composer" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="ai-input">{t.placeholder}</label>
      <textarea
        aria-describedby="ai-hint"
        disabled={status?.configured === false}
        id="ai-input"
        maxLength={maxChars}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t.placeholder}
        ref={inputRef}
        rows={2}
        value={draft}
      />
      <div className="ai-composer-bar">
        <span className="ai-model-chip" title={status?.model}>
          ✦ {status?.model ?? "Gemini"}
        </span>
        <span className="ai-hint" id="ai-hint">{draft.length > maxChars * 0.8 ? `${draft.length}/${maxChars}` : t.hint}</span>
        <button aria-label={t.send} className="ai-send" disabled={!draft.trim() || pending || cooldown > 0 || status?.configured === false} type="submit">
          <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" /></svg>
        </button>
      </div>
    </form>
  );

  return (
    <main className={`ai-page${sidebarOpen ? " sidebar-open" : ""}`} id="main-content">
      <aside aria-label={t.sidebar} className="ai-sidebar">
        <div className="ai-sidebar-head">
          <span className="ai-brand"><Logo size={26} /> {t.brand}</span>
          <button aria-label={t.sidebar} className="ai-icon-btn ai-sidebar-close" onClick={() => setSidebarOpen(false)} type="button">×</button>
        </div>
        <button className="ai-new-chat" onClick={newChat} type="button">＋ {t.newChat}</button>
        <label className="ai-search">
          <span className="sr-only">{t.search}</span>
          <input onChange={(e) => setQuery(e.target.value)} placeholder={t.search} type="search" value={query} />
        </label>
        <nav className="ai-chat-list">
          {groups.length === 0 && <p className="ai-empty">{t.noChats}</p>}
          {groups.map(([month, list]) => (
            <div key={month}>
              <span className="ai-month">{month}</span>
              {list.map((c) => (
                <div className={`ai-chat-item${c.id === activeId ? " active" : ""}`} key={c.id}>
                  <button aria-current={c.id === activeId ? "true" : undefined} onClick={() => { setActiveId(c.id); setError(null); setSidebarOpen(false); }} type="button">
                    {c.title}
                  </button>
                  <button aria-label={`${t.delete}: ${c.title}`} className="ai-chat-delete" onClick={() => remove(c.id)} type="button">×</button>
                </div>
              ))}
            </div>
          ))}
        </nav>
        <div className="ai-user">
          <span className="ai-avatar">{(fullName || username).slice(0, 1).toUpperCase()}</span>
          <span>{fullName || username}</span>
        </div>
      </aside>

      <section aria-label={t.brand} className="ai-main">
        <button aria-label={t.sidebar} className="ai-icon-btn ai-sidebar-toggle" onClick={() => setSidebarOpen(true)} type="button">☰</button>
        {status?.configured === false && <div className="ai-banner" role="alert">{t.notConfigured}</div>}
        {!active ? (
          <div className="ai-welcome">
            <h1><Logo size={34} /> {t.ready}</h1>
            <p>{t.subtitle}</p>
            {composer}
            <div className="ai-examples">
              {t.examples.map((ex) => (
                <button disabled={status?.configured === false} key={ex} onClick={() => send(ex)} type="button">{ex}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div aria-live="polite" className="ai-messages" ref={listRef}>
              {active.messages.map((m, i) => (
                <article className={`ai-msg ai-msg-${m.role}`} key={i}>
                  {m.role === "model" && <Logo size={26} />}
                  <div className="ai-bubble">
                    {m.role === "model" ? <Markdown text={m.text} /> : <p>{m.text}</p>}
                    {m.role === "model" && (
                      <div className="ai-msg-meta">
                        <CopyButton t={t} text={m.text} />
                        {m.model && <span>{m.model}</span>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {pending && (
                <article className="ai-msg ai-msg-model" role="status">
                  <Logo size={26} />
                  <div className="ai-bubble ai-typing"><span /><span /><span /> {t.thinking}</div>
                </article>
              )}
              {error && (
                <div className="ai-error" role="alert">
                  <span>{error.text}</span>
                  {error.retryable && <button disabled={cooldown > 0} onClick={retry} type="button">{cooldown > 0 ? `${t.retry} (${cooldown})` : t.retry}</button>}
                </div>
              )}
            </div>
            <div className="ai-composer-wrap">
              {composer}
              <p className="ai-disclaimer">{t.disclaimer}</p>
            </div>
          </>
        )}
        {!active && error && <div className="ai-error" role="alert"><span>{error.text}</span></div>}
      </section>
    </main>
  );
}
