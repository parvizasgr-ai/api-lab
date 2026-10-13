// Portalın bütün HTTP sorğuları buradan keçir:
//   * Authorization: Bearer <token> (auth.ts token provider-i qeydiyyatdan keçirir)
//   * 401 → refresh token ilə yeni access token → sorğu BİR dəfə təkrarlanır
//   * Backend xəta formatı {timestamp, status, code, message, details[], traceId} → AuthClientError
//   * Hər sorğu "network call" kimi qeydə alınır (Apps → Network panel, OAuth modal → HTTP calls)

export const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "/api";
// Server kökü: "/api" → "" (eyni origin), "http://localhost:3000/api" → "http://localhost:3000"
export const SERVER_URL = BASE_URL.replace(/\/api\/?$/, "");
const API_KEY: string = import.meta.env.VITE_API_KEY ?? "apilab-demo-key-2026"; // README-dəki demo açar

export type NetworkCall = {
  id: string;
  method: string;
  url: string;
  status: number;
  time: number;
  type?: "BFF";
  internalCalls?: Omit<NetworkCall, "internalCalls">[];
};

export type ErrorDetail = { field: string; message: string };

export class AuthClientError extends Error {
  status: number;
  code: string;
  traceId: string;
  retryAfter?: number;
  details: ErrorDetail[];

  constructor(
    message: string,
    status: number,
    code: string,
    traceId: string,
    retryAfter?: number,
    details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = "AuthClientError";
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
    this.details = details;
  }

  // Backend: {timestamp, status, code, message, details[], traceId}; OAuth token endpoint: {error, error_description}
  static from(response: Response, body: unknown): AuthClientError {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const retry = Number(response.headers.get("retry-after"));
    return new AuthClientError(
      String(b.message ?? b.error_description ?? response.statusText ?? "Request failed"),
      response.status,
      String(b.code ?? b.error ?? `HTTP_${response.status}`),
      String(b.traceId ?? response.headers.get("x-request-id") ?? ""),
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
      Array.isArray(b.details) ? (b.details as ErrorDetail[]) : [],
    );
  }
}

// ---- network call qeydiyyatı
type Listener = (call: NetworkCall) => void;
const listeners = new Set<Listener>();
export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- token provider (auth.ts təyin edir)
type AuthProvider = {
  getAccessToken: () => string | null;
  canRefresh: () => boolean;
  refresh: () => Promise<unknown>;
};
let authProvider: AuthProvider = { getAccessToken: () => null, canRefresh: () => false, refresh: async () => undefined };
export function setAuthProvider(provider: AuthProvider) {
  authProvider = provider;
}

export type RequestOptions = {
  body?: unknown;
  form?: Record<string, string>;
  multipart?: FormData; // fayl yükləmə — Content-Type (boundary ilə) brauzer özü təyin edir
  headers?: Record<string, string>;
  auth?: boolean; // Bearer göndər (default true)
  token?: string; // müəyyən token (məs. login-dən dərhal sonra /auth/me)
  apiKey?: boolean; // X-API-Key göndər
  retryOn401?: boolean; // default true
  accept?: string;
};

export type HttpResult<T> = { data: T; status: number; headers: Headers; call: NetworkCall };

let callCounter = 0;
const pathOf = (url: string) => {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? `${u.pathname}${u.search}` : u.toString();
  } catch {
    return url;
  }
};

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  if ((response.headers.get("content-type") ?? "").includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

// BFF cavabındakı meta.calls → Network panelində "internal calls"
function internalCallsOf(body: unknown, parentId: string): NetworkCall["internalCalls"] {
  const calls = (body as { meta?: { calls?: { name: string; status: number; durationMs: number }[] } } | null)?.meta?.calls;
  if (!Array.isArray(calls)) return undefined;
  return calls.map((c, i) => ({ id: `${parentId}-${i}`, method: "SVC", url: c.name, status: c.status, time: Math.round(c.durationMs) }));
}

export async function request<T = unknown>(method: string, url: string, options: RequestOptions = {}, retried = false): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { Accept: options.accept ?? "application/json", ...options.headers };
  let body: BodyInit | undefined;
  if (options.multipart) {
    body = options.multipart;
  } else if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const token = options.token ?? (options.auth === false ? null : authProvider.getAccessToken());
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.apiKey) headers["X-API-Key"] = API_KEY;

  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch {
    throw new AuthClientError("Server-ə qoşulmaq olmadı", 0, "NETWORK_ERROR", "");
  }
  const data = await parseBody(response);
  const id = `call-${Date.now()}-${++callCounter}`;
  const call: NetworkCall = {
    id,
    method: method.toUpperCase(),
    url: pathOf(url),
    status: response.status,
    time: Math.round(performance.now() - started),
    ...(pathOf(url).startsWith("/bff/") ? { type: "BFF" as const } : {}),
  };
  const internal = internalCallsOf(data, id);
  if (internal) call.internalCalls = internal;
  listeners.forEach((listener) => listener(call));

  // 401 → refresh → bir dəfə təkrar (yalnız öz token-imizlə göndərilən sorğularda)
  if (response.status === 401 && !retried && !options.token && options.auth !== false && options.retryOn401 !== false && authProvider.canRefresh()) {
    await authProvider.refresh();
    return request<T>(method, url, options, true);
  }
  if (!response.ok) throw AuthClientError.from(response, data);
  return { data: data as T, status: response.status, headers: response.headers, call };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", `${SERVER_URL}${path}`, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", `${SERVER_URL}${path}`, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", `${SERVER_URL}${path}`, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", `${SERVER_URL}${path}`, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", `${SERVER_URL}${path}`, options),
};
