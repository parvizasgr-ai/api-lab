import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json, mockFetch } from "../test/fetchMock";

async function load() {
  vi.resetModules();
  return import("./api");
}

const spec = {
  info: { version: "1.0.0" },
  tags: [{ name: "Cards" }, { name: "Meta" }],
  paths: {
    "/api/v1/cards/{cardId}/block": { post: { operationId: "blockCard", summary: "Kartı blokla", tags: ["Cards"], parameters: [{ $ref: "#/components/parameters/CardId" }], requestBody: { content: { "application/json": { examples: { lost: { value: { reason: "LOST" } } } } } } } },
    "/api/v1/health": { get: { operationId: "health", summary: "Health", tags: ["Meta"] } },
  },
  components: { parameters: { CardId: { name: "cardId", in: "path", example: 1 } } },
};

beforeEach(() => localStorage.clear());

describe("Explorer", () => {
  it("real cavab: status, time, size, headers, traceId", async () => {
    const { apiClient } = await load();
    const calls = mockFetch(() => json(200, { status: "ok" }, { "X-Request-Id": "req_abc" }));
    const res = await apiClient.sendExplorerRequest({ method: "POST", url: "http://localhost:3000/api/v1/x", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
    expect(res).toMatchObject({ status: 200, statusText: "OK", body: { status: "ok" }, traceId: "req_abc", size: "15 B" });
    expect(res.headers["content-type"]).toBe("application/json");
    expect(typeof res.time).toBe("number");
    expect(calls[0]).toMatchObject({ method: "POST", body: '{"a":1}' });
  });

  it("429 → errorCode + retryAfter real Retry-After başlığından; GET body göndərmir", async () => {
    const { apiClient } = await load();
    const calls = mockFetch(() => json(429, apiError(429, "TOO_MANY_REQUESTS"), { "Retry-After": "33" }));
    const res = await apiClient.sendExplorerRequest({ method: "GET", url: "/api/v1/airports", body: '{"ignored":true}' });
    expect(res).toMatchObject({ status: 429, errorCode: "TOO_MANY_REQUESTS", retryAfter: 33 });
    expect(calls[0].body).toBeUndefined();
  });

  it("5xx və XML (mətn) cavab", async () => {
    const { apiClient } = await load();
    mockFetch(() => new Response("<customer/>", { status: 503, headers: { "Content-Type": "application/xml" } }));
    const res = await apiClient.sendExplorerRequest({ method: "GET", url: "/api/v1/customers/1" });
    expect(res).toMatchObject({ status: 503, body: "<customer/>", errorCode: "HTTP_503" });
  });

  it("endpoint kitabxanası OpenAPI-dən: tag qrupları, path parametri nümunə ilə, body nümunəsi", async () => {
    const { apiClient } = await load();
    mockFetch(() => json(200, spec));
    const groups = await apiClient.getEndpointGroups();
    expect(groups.map((g) => g.label)).toEqual(["Cards", "Meta"]);
    expect(groups[0].endpoints[0]).toMatchObject({ method: "POST", path: "/api/v1/cards/1/block", label: "Kartı blokla" });
    expect(JSON.parse(groups[0].endpoints[0].body!)).toEqual({ reason: "LOST" });
  });

  it("history /_history-dən, Bearer ilə", async () => {
    const { apiClient } = await load();
    const { setAuthProvider } = await import("./http");
    setAuthProvider({ getAccessToken: () => "tok", canRefresh: () => false, refresh: async () => undefined });
    const calls = mockFetch(() => json(200, { items: [{ id: 5, requestId: "r", method: "GET", path: "/api/v1/cards", route: null, status: 200, durationMs: 3, createdAt: "2026-10-13T09:00:00Z" }] }));
    const items = await apiClient.getHistory(10);
    expect(items[0]).toMatchObject({ id: 5, path: "/api/v1/cards" });
    expect(calls[0]).toMatchObject({ url: "/api/v1/_history?limit=10", headers: { authorization: "Bearer tok" } });
  });
});

describe("Home data", () => {
  it("endpoint sayı spec-dən, status /health-dən, baseUrl origin-dən; demo istifadəçilər seed rolları ilə", async () => {
    const { apiClient } = await load();
    mockFetch((call) => (call.url.endsWith("/api/openapi.json") ? json(200, spec) : json(200, { status: "ok", db: "ok", version: "1.0.0", uptimeSec: 3 })));
    const home = await apiClient.getHomeData();
    expect(home.stats).toEqual({ endpoints: 2, tags: 2, version: "1.0.0", status: "ok" });
    expect(home.baseUrl).toBe("http://localhost:3000/api/v1");
    expect(home.sample).toMatchObject({ path: "/api/v1/health", status: 200 });
    expect(home.users.map((u) => `${u.username}:${u.role}`)).toEqual(["student:student", "admin:admin", "rauf:student"]);
    expect(JSON.stringify(home)).not.toContain("apilab.az/v1");
  });
});
