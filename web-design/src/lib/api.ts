// Portalın API client-i — hamısı real backend-ə (Callbox server) gedir, mock data yoxdur.
// Endpoint-lərin tam siyahısı: /api/openapi.json (Swagger: /docs).
import { AuthClientError, SERVER_URL, api, type NetworkCall } from "./http";

export type { NetworkCall };
export { AuthClientError };

// ---------------------------------------------------------------- Home
// Seed istifadəçiləri (db/seed/01_auth.sql, README → "Demo məlumatlar"). Parollar backend-dən oxuna bilməz,
// ona görə tədris üçün açıq yazılmış demo hesablar burada saxlanılır.
export type DemoUser = { username: string; password: string; role: "student" | "admin" };
export const DEMO_USERS: DemoUser[] = [
  { username: "student", password: "student123", role: "student" },
  { username: "admin", password: "admin123", role: "admin" },
  { username: "rauf", password: "rauf123", role: "student" },
];

export type HomeData = {
  baseUrl: string;
  curl: string;
  users: DemoUser[];
  stats: { endpoints: number; tags: number; version: string; status: string };
  sample: { method: string; path: string; status: number; body: Record<string, unknown> };
};

type OpenApiOperation = {
  operationId: string;
  summary: string;
  tags?: string[];
  parameters?: unknown[];
  security?: Record<string, string[]>[];
  requestBody?: { content?: Record<string, { example?: unknown; examples?: Record<string, { value: unknown }> }> };
};
type OpenApiDoc = {
  info: { version: string };
  tags?: { name: string }[];
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { parameters?: Record<string, { name: string; in: string; example?: unknown; schema?: { example?: unknown; default?: unknown } }> };
};

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
let specPromise: Promise<OpenApiDoc> | null = null;
export function getSpec(): Promise<OpenApiDoc> {
  specPromise ??= api
    .get<OpenApiDoc>("/api/openapi.json", { auth: false })
    .then((r) => r.data)
    .catch((error) => {
      specPromise = null;
      throw error;
    });
  return specPromise;
}

export const apiBaseUrl = () => `${SERVER_URL || window.location.origin}/api/v1`;

async function getHomeData(): Promise<HomeData> {
  const [spec, health] = await Promise.all([getSpec(), api.get<Record<string, unknown>>("/api/v1/health", { auth: false })]);
  const endpoints = Object.values(spec.paths).reduce((n, item) => n + METHODS.filter((m) => item[m]).length, 0);
  const baseUrl = apiBaseUrl();
  return {
    baseUrl,
    curl: `curl -s "${baseUrl}/currencies/rates?base=AZN" -H "X-API-Key: apilab-demo-key-2026"`,
    users: DEMO_USERS,
    stats: { endpoints, tags: spec.tags?.length ?? 0, version: spec.info.version, status: String(health.data.status) },
    sample: { method: "GET", path: "/api/v1/health", status: health.status, body: health.data },
  };
}

// ---------------------------------------------------------------- Explorer
export type ExplorerRequest = { method: string; url: string; headers?: Record<string, string>; body?: string };
export type ExplorerResponse = {
  status: number;
  statusText: string;
  time: number;
  size: string;
  body: unknown;
  headers: Record<string, string>;
  errorCode?: string;
  traceId?: string;
  retryAfter?: number;
};

const STATUS_TEXT: Record<number, string> = {
  0: "Network Error", 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 207: "Multi-Status", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable",
  409: "Conflict", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} KB`);

// Explorer sorğusu olduğu kimi göndərilir (token avtomatik yenilənmir — tələbə 401-i görməlidir)
async function sendExplorerRequest(req: ExplorerRequest): Promise<ExplorerResponse> {
  const started = performance.now();
  const hasBody = req.body !== undefined && req.body.trim() !== "" && !["GET", "HEAD"].includes(req.method);
  let response: Response;
  try {
    response = await fetch(req.url, { method: req.method, headers: req.headers, body: hasBody ? req.body : undefined });
  } catch (error) {
    return {
      status: 0,
      statusText: STATUS_TEXT[0],
      time: Math.round(performance.now() - started),
      size: "0 B",
      body: { message: (error as Error).message },
      headers: {},
      errorCode: "NETWORK_ERROR",
    };
  }
  const text = await response.text();
  const time = Math.round(performance.now() - started);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key.toLowerCase()] = value));
  let body: unknown = text;
  if ((headers["content-type"] ?? "").includes("json") && text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const retry = Number(headers["retry-after"]);
  return {
    status: response.status,
    statusText: response.statusText || STATUS_TEXT[response.status] || "",
    time,
    size: formatSize(new TextEncoder().encode(text).length),
    body,
    headers,
    errorCode: response.status >= 400 ? String(b?.code ?? b?.error ?? `HTTP_${response.status}`) : undefined,
    traceId: headers["x-request-id"] ?? (b?.traceId as string | undefined),
    retryAfter: response.status === 429 && retry > 0 ? retry : undefined,
  };
}

export type EndpointAuth = "bearer" | "apiKey" | "basic" | "none";
export type EndpointQuery = { name: string; value: string; description: string; required: boolean };
export type Endpoint = { method: string; path: string; label: string; body?: string; contentType?: string; auth: EndpointAuth; query: EndpointQuery[] };
export type EndpointGroup = { label: string; endpoints: Endpoint[] };

type SpecParam = { name: string; in: string; required?: boolean; description?: string; example?: unknown; schema?: { example?: unknown; default?: unknown } };

// Endpoint kitabxanası OpenAPI-dən (tag → qrup). Path parametrləri spec nümunələri ilə doldurulur;
// query parametrləri (məcburi olanlar nümunə dəyəri ilə), auth növü və body formatı Callbox GUI-ni avtomatik doldurur.
async function getEndpointGroups(): Promise<EndpointGroup[]> {
  const spec = await getSpec();
  const groups = new Map<string, EndpointGroup>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Other";
      if (!groups.has(tag)) groups.set(tag, { label: tag, endpoints: [] });
      const params = (op.parameters ?? []).map((p) => {
        const ref = (p as { $ref?: string }).$ref;
        return (ref ? spec.components.parameters?.[ref.split("/").pop()!] : p) as SpecParam | undefined;
      });
      const filled = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
        const param = params.find((p) => p?.name === name && p.in === "path");
        return String(param?.example ?? 1);
      });
      const [contentType, media] = Object.entries(op.requestBody?.content ?? {})[0] ?? [];
      const example = media?.example ?? Object.values(media?.examples ?? {})[0]?.value;
      const form = contentType === "application/x-www-form-urlencoded";
      const schemes = (op.security ?? []).flatMap((s) => Object.keys(s));
      const auth: EndpointAuth = schemes.some((s) => s === "bearerAuth" || s === "googleOAuth") ? "bearer" : schemes.includes("apiKeyAuth") ? "apiKey" : schemes.includes("basicAuth") ? "basic" : "none";
      groups.get(tag)!.endpoints.push({
        method: method.toUpperCase(),
        path: filled,
        label: op.summary,
        body: example === undefined ? undefined : form ? new URLSearchParams(Object.entries(example as Record<string, string>).map(([k, v]) => [k, String(v)])).toString() : JSON.stringify(example, null, 2),
        contentType,
        auth,
        query: params
          .filter((p): p is SpecParam => !!p && p.in === "query")
          .map((p) => ({ name: p.name, required: !!p.required, description: p.description ?? "", value: p.required ? String(p.example ?? p.schema?.example ?? p.schema?.default ?? "") : "" })),
      });
    }
  }
  return [...groups.values()];
}

export type HistoryEntry = { id: number; requestId: string; method: string; path: string; route: string | null; status: number; durationMs: number; createdAt: string };
async function getHistory(limit = 20): Promise<HistoryEntry[]> {
  return (await api.get<{ items: HistoryEntry[] }>(`/api/v1/_history?limit=${limit}`)).data.items;
}

// ---------------------------------------------------------------- Bank
export type Account = { id: string; type: "CURRENT" | "SAVINGS"; currency: string; balance: number; openedAt: string };
export type Card = { id: number; accountId: string; maskedNumber: string; last4: string; brand: "VISA" | "MASTERCARD"; status: "ACTIVE" | "BLOCKED" | "EXPIRED"; statusReason: string | null; dailyLimit: number; currency: string; expiresAt: string };
export type Transaction = { id: number; accountId: string; type: "DEBIT" | "CREDIT"; amount: number; currency: string; description: string; transferId: number | null; createdAt: string };
export type Dashboard = { user: { id: number; username: string; fullName: string }; accounts: Account[]; cards: Card[]; recentTransactions: Transaction[]; rates: { base: string; date: string; rates: Record<string, number> } };

const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export const bank = {
  newIdempotencyKey: () => newKey("idem"),
  dashboard: async () => (await api.get<Dashboard>("/bff/dashboard")).data,
  // Balans qrafiki üçün: hesabın son əməliyyatları (köhnədən yeniyə)
  transactions: async (accountId: string, size = 30) =>
    (await api.get<{ items: Transaction[] }>(`/api/v1/accounts/${accountId}/transactions?size=${size}&sort=-createdAt`)).data.items.reverse(),
  blockCard: async (cardId: number, reason: string, comment: string, idempotencyKey: string) =>
    (await api.post(`/api/v1/cards/${cardId}/block`, { reason, ...(comment ? { comment } : {}) }, { headers: { "Idempotency-Key": idempotencyKey } })).data,
  transfer: async (body: { fromAccountId: string; toAccountId: string; amount: number; currency: string }, idempotencyKey: string) =>
    (await api.post<{ id: number; status: string }>("/api/v1/transfers", body, { headers: { "Idempotency-Key": idempotencyKey } })).data,
};

// ---------------------------------------------------------------- Valyuta (X-API-Key)
export const currency = {
  rates: async (base: string) => (await api.get<{ base: string; date: string; rates: Record<string, number> }>(`/api/v1/currencies/rates?base=${base}`, { apiKey: true })).data,
  history: async (from: string, to: string, days = 7) =>
    (await api.get<{ points: { date: string; rate: number }[] }>(`/api/v1/currencies/history?from=${from}&to=${to}&days=${days}`, { apiKey: true })).data.points,
};

// ---------------------------------------------------------------- Aviabilet
export type Flight = { id: number; flightNo: string; airline: { code: string; name: string }; from: { code: string; city: string }; to: { code: string; city: string }; departAt: string; arriveAt: string; durationMin: number; stops: number; price: number; currency: string; seatsLeft: number };
export const flights = {
  search: async (q: { from: string; to: string; date: string; adults: number }) =>
    (await api.get<{ items: Flight[]; total: number }>(`/api/v1/flights/search?${new URLSearchParams({ from: q.from, to: q.to, date: q.date, adults: String(q.adults), size: "20" })}`)).data,
  book: async (flightId: number, passengers: { firstName: string; lastName: string }[]) =>
    (await api.post<{ id: number; total: number; currency: string }>("/api/v1/flights/bookings", { flightId, passengers })).data,
};

// ---------------------------------------------------------------- Otel
export type Hotel = { id: number; name: string; city: string; stars: number; rating: number; pricePerNightFrom: number; currency: string; pricePerNightFromAzn: number | null; amenities: string[]; availableRooms?: number };
export type Room = { id: number; hotelId: number; roomType: string; capacity: number; pricePerNight: number; currency: string; available?: boolean };
export const hotels = {
  search: async (q: { city: string; checkIn: string; checkOut: string; guests: number; minRating?: number; sort?: string }) =>
    (await api.get<{ items: Hotel[]; total: number }>(`/api/v1/hotels/search?${new URLSearchParams({ city: q.city, checkIn: q.checkIn, checkOut: q.checkOut, guests: String(q.guests), sort: q.sort ?? "price" })}`)).data,
  rooms: async (hotelId: number, checkIn: string, checkOut: string) =>
    (await api.get<{ items: Room[] }>(`/api/v1/hotels/${hotelId}/rooms?checkIn=${checkIn}&checkOut=${checkOut}`)).data.items,
  book: async (body: { roomId: number; checkIn: string; checkOut: string; guests: number }) =>
    (await api.post<{ id: number; total: number; currency: string; nights: number }>("/api/v1/hotels/bookings", body)).data,
};

// ---------------------------------------------------------------- Kitab (X-API-Key; rəy — Bearer)
export type Book = { id: number; title: string; author: string; genre: string; year: number | null; description: string; rating: number; pages: number };
export const books = {
  search: async (q: { q?: string; genre?: string }) => {
    const params = new URLSearchParams({ size: "100", sort: "-rating" });
    if (q.q) params.set("q", q.q);
    if (q.genre) params.set("genre", q.genre);
    return (await api.get<{ items: Book[]; total: number }>(`/api/v1/books/search?${params}`, { apiKey: true })).data;
  },
  review: async (bookId: number, rating: number, comment: string) => (await api.post(`/api/v1/books/${bookId}/reviews`, { rating, comment })).data,
};

// ---------------------------------------------------------------- Musiqi
export type Track = { id: number; youtubeId: string; title: string; artist: string; genre: string; durationSec: number; thumbnailUrl: string; playCount?: number };
export type Playlist = { id: number; name: string; createdAt: string; tracks: { position: number; track: Track }[] };
export const music = {
  home: async () => (await api.get<{ popular: Track[]; playlists: Playlist[] }>("/bff/music/home")).data,
  search: async (q: string) => (await api.get<{ items: Track[] }>(`/api/v1/music/search?${new URLSearchParams({ q, size: "20" })}`)).data.items,
  play: async (trackId: number) => (await api.post<{ youtubeId: string; embedUrl: string; startedAt: string }>(`/api/v1/music/tracks/${trackId}/play`)).data,
};

// ---------------------------------------------------------------- Müştərilər (CRUD)
export type Customer = { id: number; firstName: string; lastName: string; email: string; phone: string | null; city: string | null; active: boolean; createdAt: string; updatedAt: string };
export type CustomerInput = { firstName: string; lastName: string; email: string; city: string };
export const customers = {
  list: async (page = 1, size = 20) =>
    (await api.get<{ items: Customer[]; page: number; size: number; total: number; totalPages: number }>(`/api/v1/customers?page=${page}&size=${size}&sort=-createdAt`)).data,
  create: async (body: CustomerInput) => (await api.post<Customer>("/api/v1/customers", body)).data,
  // PUT — bütün sahələr (phone, active da) göndərilməlidir; PATCH — yalnız dəyişənlər
  replace: async (current: Customer, body: CustomerInput) =>
    (await api.put<Customer>(`/api/v1/customers/${current.id}`, { ...body, phone: current.phone, active: current.active })).data,
  patch: async (id: number, body: Partial<CustomerInput>) => (await api.patch<Customer>(`/api/v1/customers/${id}`, body)).data,
  remove: async (id: number) => {
    await api.delete(`/api/v1/customers/${id}`);
  },
};

// ---------------------------------------------------------------- SQL Playground
export type DbTable = { name: string; type: "table" | "view"; rowCount: number | null; columns: { name: string; type: string; primaryKey: boolean; hidden: boolean }[] };
export type SqlResult = { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number; hiddenColumns: string[]; executedSql: string };
export const sql = {
  schema: async () => (await api.get<{ tables: DbTable[] }>("/api/v1/_db/schema")).data.tables,
  query: async (query: string) => (await api.post<SqlResult>("/api/v1/_db/query", { sql: query })).data,
};

// ---------------------------------------------------------------- Materials + tapşırıqlar
export type MaterialStatus = "UPLOADED" | "CONVERTING" | "READY" | "READY_NO_PREVIEW" | "FAILED";
export type MaterialKind = "SLIDES" | "DOCUMENT" | "TASKSHEET" | "OTHER";
export type Material = {
  id: number;
  lesson: number | null;
  title: string;
  description: string | null;
  kind: MaterialKind;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
  pageCount: number | null;
  status: MaterialStatus;
  errorMessage: string | null;
  uploadedBy: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  links: { self: string; pages: string; download: string; pdf: string | null; thumbnail: string | null };
};
export type MaterialPage = { pageNo: number; imageUrl: string; thumbUrl: string };
export type LessonTask = { id: number; lesson: number; title: string; descriptionMd: string; method: string; path: string; expectedStatus: number; sqlCheck: string | null; materialId: number | null; done: boolean };
export type LessonProgress = { total: number; done: number; byLesson: { lesson: number; total: number; done: number }[] };
export type MaterialUploadMeta = { title: string; lesson: number | null; kind?: MaterialKind; description?: string };
export type MaterialPatch = Partial<{ title: string; description: string | null; lesson: number | null; kind: MaterialKind; sortOrder: number }>;

// Konvertasiya bitib? (polling dayansın)
export const isSettled = (status: MaterialStatus) => status === "READY" || status === "READY_NO_PREVIEW" || status === "FAILED";

// Client tərəfi ilkin yoxlama — son söz backend-indir (uzantı + MIME + magic bytes → 415, ölçü → 413)
export const UPLOAD_EXTENSIONS = ["pdf", "pptx", "docx", "md"];
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const learning = {
  materials: async (q: { lesson?: number; kind?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (q.lesson) params.set("lesson", String(q.lesson));
    if (q.kind) params.set("kind", q.kind);
    if (q.q) params.set("q", q.q);
    return (await api.get<{ items: Material[] }>(`/api/v1/materials${params.size ? `?${params}` : ""}`)).data.items;
  },
  material: async (id: number) => (await api.get<Material>(`/api/v1/materials/${id}`)).data,
  pages: async (id: number) => (await api.get<{ status: MaterialStatus; items: MaterialPage[] }>(`/api/v1/materials/${id}/pages`)).data.items,
  // POST multipart/form-data → 202 Accepted (konvertasiya fonda), sonra GET /materials/{id} polling
  upload: async (file: File, meta: MaterialUploadMeta) => {
    const form = new FormData();
    form.set("file", file);
    form.set("title", meta.title);
    if (meta.lesson) form.set("lesson", String(meta.lesson));
    if (meta.kind) form.set("kind", meta.kind);
    if (meta.description) form.set("description", meta.description);
    return (await api.post<Material>("/api/v1/materials", undefined, { multipart: form })).data;
  },
  update: async (id: number, patch: MaterialPatch) => (await api.patch<Material>(`/api/v1/materials/${id}`, patch)).data,
  reconvert: async (id: number) => (await api.post<Material>(`/api/v1/materials/${id}/reconvert`)).data,
  remove: async (id: number) => {
    await api.delete(`/api/v1/materials/${id}`);
  },
  tasks: async (lesson?: number) => (await api.get<{ items: LessonTask[] }>(`/api/v1/tasks${lesson ? `?lesson=${lesson}` : ""}`)).data.items,
  setDone: async (taskId: number, done: boolean) => (await api.put<{ done: boolean }>(`/api/v1/tasks/${taskId}/progress`, { done })).data,
  progress: async () => (await api.get<LessonProgress>("/api/v1/tasks/progress/me")).data,
  fileUrl: (link: string) => `${SERVER_URL}${link}`,
};

// Səhifələr arası ötürmə: tapşırıqdan Explorer-ə / SQL-ə hazır sorğu ilə keçid
// Explorer-ə hazır sorğu: headers/body opsional (External APIs — X-RapidAPI-Key yalnız yaddaşdan gəlir)
type Handoff = {
  explorer?: { method: string; path: string; headers?: Record<string, string>; body?: string; contentType?: string; auth?: "bearer" | "apiKey" | "basic" | "none" };
  sql?: string;
  lesson?: number;
};
let handoff: Handoff = {};
export const handoffs = {
  set: (next: Handoff) => (handoff = next),
  take: (): Handoff => {
    const current = handoff;
    handoff = {};
    return current;
  },
};

export const apiClient = {
  getHomeData,
  getEndpointGroups,
  getHistory,
  sendExplorerRequest,
};
