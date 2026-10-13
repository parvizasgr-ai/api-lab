import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json, mockFetch } from "../test/fetchMock";

// Modul səviyyəli state (token provider, listener-lər) hər test üçün təzə olsun
async function load() {
  vi.resetModules();
  return import("./http");
}

beforeEach(() => localStorage.clear());

describe("AuthClientError.from — backend xəta formatı", () => {
  it("{timestamp,status,code,message,details,traceId} və Retry-After oxunur", async () => {
    const { AuthClientError } = await load();
    const response = json(429, apiError(429, "TOO_MANY_REQUESTS", "Çox sayda sorğu", { details: [{ field: "x", message: "y" }] }), { "Retry-After": "42" });
    const error = AuthClientError.from(response, await response.clone().json());
    expect(error).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS", message: "Çox sayda sorğu", traceId: "trace_TOO_MANY_REQUESTS", retryAfter: 42 });
    expect(error.details).toEqual([{ field: "x", message: "y" }]);
  });

  it("OAuth RFC 6749 formatı ({error, error_description}) da başa düşülür", async () => {
    const { AuthClientError } = await load();
    const error = AuthClientError.from(json(400, null), { error: "invalid_grant", error_description: "code artıq istifadə olunub" });
    expect(error).toMatchObject({ status: 400, code: "invalid_grant", message: "code artıq istifadə olunub", traceId: "req_400" });
  });
});

describe("request()", () => {
  it("Bearer token və X-API-Key əlavə olunur; JSON body göndərilir", async () => {
    const http = await load();
    http.setAuthProvider({ getAccessToken: () => "tok-1", canRefresh: () => false, refresh: async () => undefined });
    const calls = mockFetch(() => json(201, { id: 7 }));
    const result = await http.api.post<{ id: number }>("/api/v1/transfers", { amount: 1 }, { apiKey: true, headers: { "Idempotency-Key": "k-1" } });
    expect(result.data.id).toBe(7);
    expect(calls[0].headers).toMatchObject({ authorization: "Bearer tok-1", "x-api-key": "apilab-demo-key-2026", "idempotency-key": "k-1", "content-type": "application/json" });
    expect(calls[0].body).toBe('{"amount":1}');
  });

  it("401 → refresh → sorğu BİR dəfə təkrarlanır (yeni token ilə)", async () => {
    const http = await load();
    let token = "old";
    const refresh = vi.fn(async () => {
      token = "new";
    });
    http.setAuthProvider({ getAccessToken: () => token, canRefresh: () => true, refresh });
    const calls = mockFetch((call) => (call.headers.authorization === "Bearer new" ? json(200, { ok: true }) : json(401, apiError(401, "TOKEN_EXPIRED"))));
    const result = await http.api.get<{ ok: boolean }>("/api/v1/cards");
    expect(result.data.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.headers.authorization)).toEqual(["Bearer old", "Bearer new"]);
  });

  it("refresh-dən sonra yenə 401 → sonsuz dövr yoxdur, xəta atılır", async () => {
    const http = await load();
    const refresh = vi.fn(async () => undefined);
    http.setAuthProvider({ getAccessToken: () => "x", canRefresh: () => true, refresh });
    const calls = mockFetch(() => json(401, apiError(401, "INVALID_TOKEN")));
    await expect(http.api.get("/api/v1/cards")).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    expect(calls).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("auth: false sorğularda (login) 401 refresh-ə səbəb olmur", async () => {
    const http = await load();
    const refresh = vi.fn(async () => undefined);
    http.setAuthProvider({ getAccessToken: () => "x", canRefresh: () => true, refresh });
    mockFetch(() => json(401, apiError(401, "INVALID_CREDENTIALS")));
    await expect(http.api.post("/api/v1/auth/login", {}, { auth: false })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("network call qeydə alınır; BFF meta.calls → internal calls", async () => {
    const http = await load();
    const seen: unknown[] = [];
    http.subscribeNetwork((call) => seen.push(call));
    mockFetch(() => json(207, { meta: { calls: [{ name: "flights.search", status: 200, durationMs: 4 }, { name: "hotels.search", status: 503, durationMs: 1 }] } }));
    await http.api.get("/bff/travel/search?from=GYD").catch(() => undefined);
    expect(seen[0]).toMatchObject({
      method: "GET",
      url: "/bff/travel/search?from=GYD",
      status: 207,
      type: "BFF",
      internalCalls: [
        { method: "SVC", url: "flights.search", status: 200, time: 4 },
        { method: "SVC", url: "hotels.search", status: 503, time: 1 },
      ],
    });
  });

  it("şəbəkə xətası → status 0 NETWORK_ERROR", async () => {
    const http = await load();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(http.api.get("/api/v1/health")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});
