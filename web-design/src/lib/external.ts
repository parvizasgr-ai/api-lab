// External APIs (RapidAPI) — portal tərəfi.
//   * Tələbənin RapidAPI açarı YALNIZ bu modulun yaddaşındadır: localStorage/sessionStorage/cookie yoxdur, reload-da silinir.
//   * Sorğular Callbox proxy-sinə gedir (/external/...), açar X-RapidAPI-Key başlığında — server onu yalnız ötürür.
import { api, SERVER_URL } from "./http";

export type Localized = { az: string; en: string };
export type ExternalEndpoint = {
  operationId: string;
  method: "GET" | "POST";
  path: string;
  produces: "json" | "image";
  summary: Localized;
  example: { path: string; query?: Record<string, string>; body?: Record<string, unknown> };
};
export type ExternalApi = {
  id: string;
  name: string;
  host: string;
  rapidApiUrl: string;
  description: Localized;
  freeLimit: Localized;
  hardLimit: boolean;
  verified: boolean;
  serverKeyAvailable: boolean;
  endpoints: ExternalEndpoint[];
};
export type ExternalCatalog = { items: ExternalApi[]; serverKeyEnabled: boolean; unverified?: string[] };

// ---- açar: yalnız yaddaşda
let memoryKey = "";
const listeners = new Set<(key: string) => void>();
export const externalKey = {
  get: () => memoryKey,
  set: (key: string) => {
    memoryKey = key.trim();
    listeners.forEach((l) => l(memoryKey));
  },
  clear: () => externalKey.set(""),
  subscribe: (listener: (key: string) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const exampleUrl = (endpoint: ExternalEndpoint) => {
  const query = new URLSearchParams(endpoint.example.query ?? {}).toString();
  return `${endpoint.example.path}${query ? `?${query}` : ""}`;
};

export type ExternalResult = { status: number; contentType: string; body: unknown; imageUrl?: string; headers: Headers; time: number };

export const external = {
  catalog: async () => (await api.get<ExternalCatalog>("/external/catalog")).data,
  // Nümunə sorğunu proxy ilə göndərir; xəta → AuthClientError (code: EXTERNAL_KEY_MISSING, EXTERNAL_RATE_LIMITED, ...)
  run: async (endpoint: ExternalEndpoint): Promise<ExternalResult> => {
    const key = externalKey.get();
    const headers = key ? { "X-RapidAPI-Key": key } : undefined;
    const started = performance.now();
    const options = { headers, binary: endpoint.produces === "image", accept: endpoint.produces === "image" ? "image/png, application/json" : "application/json" };
    const result =
      endpoint.method === "POST"
        ? await api.post<unknown>(exampleUrl(endpoint), endpoint.example.body ?? {}, options)
        : await api.get<unknown>(exampleUrl(endpoint), options);
    const contentType = result.headers.get("content-type") ?? "";
    return {
      status: result.status,
      contentType,
      body: result.data,
      imageUrl: result.data instanceof Blob ? URL.createObjectURL(result.data) : undefined,
      headers: result.headers,
      time: Math.round(performance.now() - started),
    };
  },
  // Explorer-ə ötürüləcək hazır sorğu (açar varsa başlıqda — yenə yalnız yaddaşda)
  handoff: (endpoint: ExternalEndpoint) => ({
    method: endpoint.method,
    path: exampleUrl(endpoint),
    headers: externalKey.get() ? { "X-RapidAPI-Key": externalKey.get() } : undefined,
    body: endpoint.method === "POST" ? JSON.stringify(endpoint.example.body ?? {}, null, 2) : undefined,
  }),
  serverUrl: SERVER_URL,
};
