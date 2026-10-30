// API Reference (/reference) — developer portal, Stripe API Reference üslubunda:
//   solda naviqasiya (bölmələr + endpoint-lər), ortada sənəd (təsvir, parametrlər, body atributları, cavab, xətalar),
//   sağda kod nümunələri (cURL / JavaScript / Python) və cavab nümunəsi. Hər şey OpenAPI spec-dən yaranır.
// "Callbox GUI-də sına" — sorğu hazır vəziyyətdə Callbox GUI-də açılır (token avtomatik Authorization-a düşür).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { handoffs } from "./lib/api";
import { apiToken, codeSample, encodeForm, exampleRequest, getReferenceModel, PUBLIC_CLIENT_ID, requestToken, TOKEN_PATH, type CodeLang, type RefAttribute, type RefModel, type RefOperation } from "./lib/reference";
import { JsonView, Markdown } from "./reference/Markdown";

type Language = "az" | "en";

const TEXT = {
  az: {
    kicker: "Developer portal",
    title: "API Reference",
    search: "Axtar…",
    gettingStarted: "Başlanğıc",
    introduction: "Giriş",
    authentication: "Autentifikasiya",
    errors: "Xətalar",
    pagination: "Pagination",
    labs: "Laboratoriyalar",
    authLab: "Auth Lab (JWT, OAuth)",
    demoApps: "Demo tətbiqlər",
    parameters: "Parametrlər",
    pathParams: "Path parametrləri",
    queryParams: "Query parametrləri",
    headerParams: "Başlıqlar",
    body: "Request body",
    returns: "Cavab",
    errorsTable: "Xətalar",
    required: "məcburi",
    optional: "könüllü",
    nullable: "null ola bilər",
    defaultLabel: "default",
    oneOf: "Mümkün dəyərlər",
    children: "Daxili atributları göstər",
    hideChildren: "Daxili atributları gizlət",
    tryIt: "Callbox GUI-də sına",
    copy: "Kopyala",
    copied: "Kopyalandı",
    response: "Cavab",
    request: "Sorğu",
    bearer: "Bearer token tələb edir",
    publicApi: "Autentifikasiya tələb olunmur",
    scopes: "Scope",
    loading: "Sənəd yüklənir…",
    loadError: "Spec yüklənmədi",
    retry: "Yenidən cəhd et",
    noResults: "Heç nə tapılmadı",
    tokenReady: (u: string, m: number) => `Token hazırdır (${u}) — ${m} dəq etibarlıdır. Callbox GUI onu Bearer sorğulara avtomatik qoyur.`,
    tokenNone: "Hələ token yoxdur. Bank API-ləri üçün əvvəlcə token alın:",
    getToken: "student hesabı ilə token al",
    clearToken: "Tokeni sil",
    endpoints: "Endpoint-lər",
  },
  en: {
    kicker: "Developer portal",
    title: "API Reference",
    search: "Search…",
    gettingStarted: "Getting started",
    introduction: "Introduction",
    authentication: "Authentication",
    errors: "Errors",
    pagination: "Pagination",
    labs: "Labs",
    authLab: "Auth Lab (JWT, OAuth)",
    demoApps: "Demo apps",
    parameters: "Parameters",
    pathParams: "Path parameters",
    queryParams: "Query parameters",
    headerParams: "Headers",
    body: "Request body",
    returns: "Returns",
    errorsTable: "Errors",
    required: "required",
    optional: "optional",
    nullable: "nullable",
    defaultLabel: "default",
    oneOf: "Possible values",
    children: "Show child attributes",
    hideChildren: "Hide child attributes",
    tryIt: "Try in Callbox GUI",
    copy: "Copy",
    copied: "Copied",
    response: "Response",
    request: "Request",
    bearer: "Requires a Bearer token",
    publicApi: "No authentication required",
    scopes: "Scope",
    loading: "Loading reference…",
    loadError: "Could not load the spec",
    retry: "Retry",
    noResults: "Nothing found",
    tokenReady: (u: string, m: number) => `Token ready (${u}) — valid for ${m} min. Callbox GUI adds it to Bearer requests automatically.`,
    tokenNone: "No token yet. Get one before calling the banking APIs:",
    getToken: "Get a token as student",
    clearToken: "Clear token",
    endpoints: "Endpoints",
  },
};
type Text = (typeof TEXT)["az"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tagId = (name: string) => `tag-${slug(name)}`;
const opId = (op: RefOperation) => `op-${op.id}`;

function MethodBadge({ method }: { method: string }) {
  return <span className={`ref-method method-${method.toLowerCase()}`}>{method}</span>;
}

function CopyBtn({ text, t }: { text: string; t: Text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ref-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      type="button"
    >
      {done ? t.copied : t.copy}
    </button>
  );
}

function Attribute({ attr, t }: { attr: RefAttribute; t: Text }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="ref-attr">
      <div className="ref-attr-head">
        <code className="ref-attr-name">{attr.name}</code>
        <span className="ref-attr-type">{attr.type}</span>
        {attr.required ? <span className="ref-attr-required">{t.required}</span> : <span className="ref-attr-optional">{t.optional}</span>}
        {attr.nullable && <span className="ref-attr-optional">{t.nullable}</span>}
      </div>
      {attr.description && <Markdown text={attr.description} />}
      {(attr.enum?.length || attr.default !== undefined || attr.constraints.length > 0) && (
        <div className="ref-attr-meta">
          {attr.enum?.length ? (
            <span>
              {t.oneOf}: {attr.enum.map((v) => <code key={String(v)}>{String(v)}</code>)}
            </span>
          ) : null}
          {attr.default !== undefined && (
            <span>
              {t.defaultLabel}: <code>{String(attr.default)}</code>
            </span>
          )}
          {attr.constraints.map((c) => <span key={c}><code>{c}</code></span>)}
        </div>
      )}
      {attr.children.length > 0 && (
        <div className="ref-children">
          <button aria-expanded={open} className="ref-children-toggle" onClick={() => setOpen((v) => !v)} type="button">
            {open ? t.hideChildren : t.children}
          </button>
          {open && <ul className="ref-attr-list">{attr.children.map((c) => <Attribute attr={c} key={c.name} t={t} />)}</ul>}
        </div>
      )}
    </li>
  );
}

function ParamTable({ title, params, t }: { title: string; params: RefOperation["params"]; t: Text }) {
  if (!params.length) return null;
  return (
    <div className="ref-block">
      <h4>{title}</h4>
      <ul className="ref-attr-list">
        {params.map((p) => (
          <Attribute
            attr={{ name: p.name, type: p.type, required: p.required, nullable: false, description: p.description + (p.example !== undefined ? ` Nümunə: \`${String(p.example)}\`` : ""), enum: p.enum, default: p.default, constraints: [], children: [] }}
            key={`${p.in}-${p.name}`}
            t={t}
          />
        ))}
      </ul>
    </div>
  );
}

function CodePanel({ op, origin, t, onTry }: { op: RefOperation; origin: string; t: Text; onTry: () => void }) {
  const [lang, setLang] = useState<CodeLang>("curl");
  const success = op.responses.filter((r) => r.examples.length);
  const [status, setStatus] = useState(success[0]?.status ?? "");
  const current = success.find((r) => r.status === status) ?? success[0];
  const [exIndex, setExIndex] = useState(0);
  const example = current?.examples[Math.min(exIndex, (current?.examples.length ?? 1) - 1)];
  const code = codeSample(op, lang, origin);
  return (
    <div className="ref-code-column">
      <div className="ref-code-card">
        <div className="ref-code-head">
          <span className="ref-code-title"><MethodBadge method={op.method} /> {op.path}</span>
          <CopyBtn t={t} text={code} />
        </div>
        <div aria-label={t.request} className="ref-lang-tabs" role="tablist">
          {(["curl", "javascript", "python"] as CodeLang[]).map((l) => (
            <button aria-selected={lang === l} className={lang === l ? "active" : ""} key={l} onClick={() => setLang(l)} role="tab" type="button">
              {l === "curl" ? "cURL" : l === "javascript" ? "JavaScript" : "Python"}
            </button>
          ))}
        </div>
        <pre tabIndex={0} className="ref-code"><code>{code}</code></pre>
        <button className="ref-try" onClick={onTry} type="button">▶ {t.tryIt}</button>
      </div>
      {current && example && (
        <div className="ref-code-card">
          <div className="ref-code-head">
            <span className="ref-code-title">{t.response}</span>
            <label className="ref-status-select">
              <span className="sr-only">HTTP status</span>
              <select
                onChange={(e) => {
                  setStatus(e.target.value);
                  setExIndex(0);
                }}
                value={current.status}
              >
                {success.map((r) => <option key={r.status} value={r.status}>{r.status} — {r.description}</option>)}
              </select>
            </label>
          </div>
          {current.examples.length > 1 && (
            <div className="ref-example-tabs">
              {current.examples.map((e, i) => (
                <button className={i === exIndex ? "active" : ""} key={e.name} onClick={() => setExIndex(i)} type="button">{e.summary}</button>
              ))}
            </div>
          )}
          <pre tabIndex={0} className="ref-code ref-json"><JsonView value={example.value} /></pre>
        </div>
      )}
    </div>
  );
}

function OperationSection({ op, origin, t, onTry }: { op: RefOperation; origin: string; t: Text; onTry: (op: RefOperation) => void }) {
  const byIn = (where: string) => op.params.filter((p) => p.in === where);
  return (
    <section aria-labelledby={`${opId(op)}-title`} className="ref-section ref-operation" id={opId(op)}>
      <div className="ref-doc">
        <h3 id={`${opId(op)}-title`}>{op.summary}</h3>
        <div className="ref-endpoint-line">
          <MethodBadge method={op.method} />
          <code>{op.path}</code>
        </div>
        <div className={`ref-auth-badge ${op.auth === "none" ? "public" : "secured"}`}>
          {op.auth === "bearer" ? `🔒 ${t.bearer}` : op.auth === "none" ? t.publicApi : op.auth}
          {op.scopes.length > 0 && <span> · {t.scopes}: {op.scopes.map((s) => <code key={s}>{s}</code>)}</span>}
        </div>
        <Markdown text={op.description} />
        <ParamTable params={byIn("path")} t={t} title={t.pathParams} />
        <ParamTable params={byIn("query")} t={t} title={t.queryParams} />
        <ParamTable params={byIn("header")} t={t} title={t.headerParams} />
        {op.bodyAttributes.length > 0 && (
          <div className="ref-block">
            <h4>{t.body} <code className="ref-content-type">{op.contentType}</code></h4>
            <ul className="ref-attr-list">{op.bodyAttributes.map((a) => <Attribute attr={a} key={a.name} t={t} />)}</ul>
          </div>
        )}
        {op.responseAttributes.length > 0 && (
          <div className="ref-block">
            <h4>{t.returns}</h4>
            <p className="ref-returns">{op.responses.filter((r) => r.status.startsWith("2")).map((r) => `${r.status} — ${r.description}`).join(" · ")}</p>
            <ul className="ref-attr-list">{op.responseAttributes.map((a) => <Attribute attr={a} key={a.name} t={t} />)}</ul>
          </div>
        )}
        {op.errorCodes.length > 0 && (
          <div className="ref-block">
            <h4>{t.errorsTable}</h4>
            <div className="md-table-wrap" tabIndex={0}>
              <table className="md-table ref-errors">
                <thead><tr><th>HTTP</th><th>code</th><th>message</th></tr></thead>
                <tbody>
                  {op.errorCodes.map((e) => (
                    <tr key={`${e.status}-${e.code}`}><td><code>{e.status}</code></td><td><code>{e.code}</code></td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <CodePanel onTry={() => onTry(op)} op={op} origin={origin} t={t} />
    </section>
  );
}

function TokenBox({ t }: { t: Text }) {
  const [token, setToken] = useState(apiToken.get);
  const [busy, setBusy] = useState(false);
  useEffect(() => apiToken.subscribe(() => setToken(apiToken.get())), []);
  const minutes = token ? Math.max(0, Math.round((token.expiresAt - Date.now()) / 60000)) : 0;
  const get = async () => {
    setBusy(true);
    try {
      await requestToken({ grant_type: "password", client_id: PUBLIC_CLIENT_ID, username: "student", password: "student123" });
    } finally {
      setBusy(false);
    }
  };
  return token && minutes > 0 ? (
    <div className="ref-token ok" role="status">
      <span>{t.tokenReady(token.username ?? "?", minutes)}</span>
      <button onClick={() => apiToken.clear()} type="button">{t.clearToken}</button>
    </div>
  ) : (
    <div className="ref-token" role="status">
      <span>{t.tokenNone}</span>
      <button disabled={busy} onClick={() => void get()} type="button">{t.getToken}</button>
    </div>
  );
}

function Intro({ model, origin, t }: { model: RefModel; origin: string; t: Text }) {
  const bank = model.groups.flatMap((g) => g.tags).flatMap((tag) => tag.operations).filter((o) => o.auth === "bearer");
  return (
    <>
      <section className="ref-section ref-intro" id="introduction">
        <div className="ref-doc">
          <span className="section-kicker">{t.kicker}</span>
          <h1>{t.title}</h1>
          <Markdown
            text={`**Callbox API v2** — REST API: resurs yönümlü URL-lər, JSON request və response, standart HTTP status kodları və vahid xəta formatı.
Valyuta, aviareys, otel və kitab API-ləri **açıqdır** (token lazım deyil). **Bank** API-ləri (${bank.length} endpoint) üçün OAuth 2.0 / OpenID Connect token lazımdır.

### Başlamaq üçün 3 addım
- **Token alın:** \`POST ${TOKEN_PATH}\` (aşağıda — Autentifikasiya).
- **Token-i başlığa yazın:** \`Authorization: Bearer <access_token>\`.
- **Sorğu göndərin:** hər endpoint-in sağında hazır cURL / JavaScript / Python nümunəsi və **Callbox GUI-də sına** düyməsi var.

| Mövzu | Qayda |
|---|---|
| Base URL | \`${origin}\` |
| Format | \`application/json\` (token endpoint-i: \`application/x-www-form-urlencoded\`) |
| Pul | decimal number, 2 onluq: \`125.50\` |
| Tarix / vaxt | ISO 8601: \`2026-10-30\`, \`2026-10-30T09:00:00Z\` (UTC) |
| Rate limit | 60 sorğu / dəqiqə → \`429\` + \`Retry-After\` |`}
          />
        </div>
        <div className="ref-code-column">
          <div className="ref-code-card">
            <div className="ref-code-head"><span className="ref-code-title">Base URL</span><CopyBtn t={t} text={origin} /></div>
            <pre tabIndex={0} className="ref-code"><code>{origin}</code></pre>
          </div>
          <TokenBox t={t} />
        </div>
      </section>
      <section className="ref-section" id="authentication">
        <div className="ref-doc">
          <h2>{t.authentication}</h2>
          <Markdown
            text={`Bank API-ləri **OAuth 2.0 Bearer token** ilə qorunur (RFC 6750). Token-i Keycloak üslublu **OpenID Connect token endpoint**-indən alırsınız:

- \`grant_type=password\` + \`username\` + \`password\` → \`access_token\` (15 dəq) və \`refresh_token\` (7 gün).
- \`access_token\` bitəndə: \`grant_type=refresh_token\` → yeni cüt (köhnə refresh token ləğv olunur).
- \`client_id\` həmişə \`${PUBLIC_CLIENT_ID}\`.

| Status | Səbəb |
|---|---|
| \`401 UNAUTHORIZED\` | \`Authorization\` başlığı yoxdur |
| \`401 TOKEN_EXPIRED\` | Token-in vaxtı keçib — refresh edin |
| \`403 INSUFFICIENT_SCOPE\` | Token-də lazımi scope yoxdur (məs. \`rauf\` istifadəçisində \`cards:write\` yoxdur) |
| \`403 FORBIDDEN\` | Başqasının resursu (BOLA qorunması) |

Demo hesablar: \`student / student123\` (bütün scope-lar), \`rauf / rauf123\` (\`cards:write\` yoxdur).`}
          />
        </div>
        <div className="ref-code-column">
          <div className="ref-code-card">
            <div className="ref-code-head"><span className="ref-code-title">cURL</span></div>
            <pre tabIndex={0} className="ref-code"><code>{`curl -X POST "${origin}${TOKEN_PATH}" \\\n  -H "Content-Type: application/x-www-form-urlencoded" \\\n  --data-urlencode "grant_type=password" \\\n  --data-urlencode "client_id=${PUBLIC_CLIENT_ID}" \\\n  --data-urlencode "username=student" \\\n  --data-urlencode "password=student123"\n\n# Cavabdakı access_token:\ncurl "${origin}/api/v2/accounts" \\\n  -H "Authorization: Bearer $ACCESS_TOKEN"`}</code></pre>
          </div>
        </div>
      </section>
      <section className="ref-section" id="errors">
        <div className="ref-doc">
          <h2>{t.errors}</h2>
          <Markdown
            text={`Bütün xətalar eyni formatdadır. Proqram məntiqi \`message\`-ə yox, sabit **\`code\`**-a əsaslanmalıdır; \`traceId\` cavabdakı \`X-Request-Id\` ilə eynidir.

| HTTP | Mənası |
|---|---|
| \`400\` | Sorğu oxunmur (səhv JSON) |
| \`401\` | Autentifikasiya yoxdur / etibarsızdır |
| \`403\` | İcazə yoxdur |
| \`404\` | Resurs tapılmadı |
| \`409\` | Resursun vəziyyəti ilə ziddiyyət (artıq bloklanıb, otaq tutulub) |
| \`413\` / \`415\` | Body çox böyükdür / Content-Type səhvdir |
| \`422\` | Validation və ya biznes qaydası (\`details[]\` — hansı sahə) |
| \`429\` | Rate limit — \`Retry-After\` saniyə gözləyin |
| \`500\` | Server xətası — \`traceId\` ilə müəllimə müraciət edin |

Token endpoint-i xətaları OAuth 2.0 formatında qaytarır: \`{"error": "invalid_grant", "error_description": "..."}\`.`}
          />
        </div>
        <div className="ref-code-column">
          <div className="ref-code-card">
            <div className="ref-code-head"><span className="ref-code-title">422 VALIDATION_ERROR</span></div>
            <pre tabIndex={0} className="ref-code ref-json"><JsonView value={{ timestamp: "2026-10-30T09:00:00Z", status: 422, code: "INSUFFICIENT_FUNDS", message: "Hesabda kifayət qədər vəsait yoxdur", details: [{ field: "amount", message: "Mövcud balans: 398.19 AZN" }], traceId: "req_7f2c9a" }} /></pre>
          </div>
        </div>
      </section>
      <section className="ref-section" id="pagination">
        <div className="ref-doc">
          <h2>{t.pagination}</h2>
          <Markdown
            text={`Siyahı qaytaran endpoint-lər eyni zərfi istifadə edir: \`{ "object": "list", "url", "hasMore", "data": [...] }\`.
Səhifələnən siyahılarda (çıxarış, kitab rəyləri) **cursor pagination**: \`limit\` + \`startingAfter\` = əvvəlki səhifənin son elementinin \`id\`-si. \`hasMore: false\` — son səhifə.`}
          />
        </div>
        <div className="ref-code-column">
          <div className="ref-code-card">
            <pre tabIndex={0} className="ref-code ref-json"><JsonView value={{ object: "list", url: "/api/v2/books/12/reviews", hasMore: true, data: ["…"] }} /></pre>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ReferencePage({ language, onNavigate }: { language: Language; onNavigate: (page: "explorer" | "auth" | "apps") => void }) {
  const t = TEXT[language];
  const origin = window.location.origin;
  const [model, setModel] = useState<RefModel | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("introduction");
  const contentRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setError(false);
    getReferenceModel().then(setModel).catch(() => setError(true));
  };
  useEffect(load, []);

  // İlk açılışda #hash-ə sürüşdür; scroll zamanı aktiv bölməni naviqasiyada işıqlandır
  useEffect(() => {
    if (!model) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    contentRef.current?.querySelectorAll(".ref-section").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [model]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    window.history.replaceState(window.history.state, "", `#${id}`);
    setActive(id);
  };

  const tags = useMemo(() => model?.groups.flatMap((g) => g.tags) ?? [], [model]);
  const q = query.trim().toLowerCase();
  const navTags = tags
    .map((tag) => ({ ...tag, operations: tag.operations.filter((op) => !q || `${op.summary} ${op.method} ${op.path} ${tag.name}`.toLowerCase().includes(q)) }))
    .filter((tag) => tag.operations.length > 0);

  const tryIt = (op: RefOperation) => {
    const ex = exampleRequest(op, origin);
    const form = op.contentType === "application/x-www-form-urlencoded";
    handoffs.set({
      explorer: {
        method: op.method,
        path: ex.path,
        body: ex.body === undefined ? undefined : form ? encodeForm(ex.body) : JSON.stringify(ex.body, null, 2),
        contentType: op.contentType ?? undefined,
        auth: op.auth,
      },
    });
    onNavigate("explorer");
  };

  if (error) {
    return (
      <main className="ref-page" id="main-content">
        <div className="ref-state" role="alert">{t.loadError} <button onClick={load} type="button">{t.retry}</button></div>
      </main>
    );
  }
  if (!model) {
    return <main aria-busy="true" className="ref-page" id="main-content"><div className="ref-state">{t.loading}</div></main>;
  }

  const navLink = (id: string, label: string, extra?: ReactNode) => (
    <a aria-current={active === id ? "location" : undefined} className={active === id ? "active" : ""} href={`#${id}`} onClick={(e) => { e.preventDefault(); go(id); }}>
      {label}
      {extra}
    </a>
  );

  return (
    <main className="ref-page" id="main-content">
      <aside aria-label={t.title} className="ref-nav">
        <label className="ref-search">
          <span className="sr-only">{t.search}</span>
          <input onChange={(e) => setQuery(e.target.value)} placeholder={t.search} type="search" value={query} />
        </label>
        <nav>
          {!q && (
            <div className="ref-nav-group">
              <span className="ref-nav-title">{t.gettingStarted}</span>
              {navLink("introduction", t.introduction)}
              {navLink("authentication", t.authentication)}
              {navLink("errors", t.errors)}
              {navLink("pagination", t.pagination)}
            </div>
          )}
          {navTags.map((tag) => (
            <div className="ref-nav-group" key={tag.name}>
              {navLink(tagId(tag.name), tag.name)}
              {tag.operations.map((op) => (
                <span className="ref-nav-op" key={op.id}>
                  {navLink(opId(op), op.summary, <small className={`ref-nav-method method-${op.method.toLowerCase()}`}>{op.method}</small>)}
                </span>
              ))}
            </div>
          ))}
          {q && navTags.length === 0 && <p className="ref-nav-empty">{t.noResults}</p>}
          {!q && (
            <div className="ref-nav-group">
              <span className="ref-nav-title">{t.labs}</span>
              <a href="/auth" onClick={(e) => { e.preventDefault(); onNavigate("auth"); }}>{t.authLab}</a>
              <a href="/apps" onClick={(e) => { e.preventDefault(); onNavigate("apps"); }}>{t.demoApps}</a>
            </div>
          )}
        </nav>
      </aside>
      <div className="ref-content" ref={contentRef}>
        <Intro model={model} origin={origin} t={t} />
        {tags.map((tag) => (
          <div key={tag.name}>
            <section aria-labelledby={`${tagId(tag.name)}-title`} className="ref-section ref-tag" id={tagId(tag.name)}>
              <div className="ref-doc">
                <h2 id={`${tagId(tag.name)}-title`}>{tag.name}</h2>
                <Markdown text={tag.description} />
              </div>
              <div className="ref-code-column">
                <div className="ref-code-card ref-endpoint-list">
                  <div className="ref-code-head"><span className="ref-code-title">{t.endpoints}</span></div>
                  <ul>
                    {tag.operations.map((op) => (
                      <li key={op.id}>
                        <a href={`#${opId(op)}`} onClick={(e) => { e.preventDefault(); go(opId(op)); }}>
                          <MethodBadge method={op.method} />
                          <code>{op.path}</code>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
            {tag.operations.map((op) => <OperationSection key={op.id} onTry={tryIt} op={op} origin={origin} t={t} />)}
          </div>
        ))}
      </div>
    </main>
  );
}
