import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, json, mockFetch, type MockCall } from "../test/fetchMock";

async function load() {
  vi.resetModules();
  return import("./auth");
}

const tokens = (n: number) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: "Bearer", expires_in: 900, scope: "accounts:read cards:read" });
const profile = (role: "USER" | "ADMIN", username = role === "ADMIN" ? "admin" : "student") => ({
  id: role === "ADMIN" ? 2 : 1,
  username,
  fullName: role === "ADMIN" ? "Admin Əliyev" : "Aysel Məmmədova",
  email: `${username}@apilab.az`,
  role,
  scopes: [],
});

function backend(role: "USER" | "ADMIN" = "USER") {
  let issued = 1;
  return (call: MockCall) => {
    const path = new URL(call.url, "http://localhost:3000").pathname;
    if (path === "/api/v1/auth/login") {
      const { password } = JSON.parse(call.body ?? "{}");
      return password === "ok" ? json(200, tokens(issued)) : json(401, apiError(401, "INVALID_CREDENTIALS", "Username və ya parol səhvdir"));
    }
    if (path === "/api/v1/auth/me") return json(200, profile(role));
    if (path === "/api/v1/auth/refresh") {
      const { refresh_token } = JSON.parse(call.body ?? "{}");
      return refresh_token === `refresh-${issued}` ? json(200, tokens(++issued)) : json(401, apiError(401, "INVALID_REFRESH_TOKEN"));
    }
    if (path === "/api/v1/auth/logout") return new Response(null, { status: 204 });
    return json(404, apiError(404, "ROUTE_NOT_FOUND"));
  };
}

beforeEach(() => localStorage.clear());

describe("login / rollar", () => {
  it("USER → student; sessiya /auth/me ilə qurulur və localStorage-də saxlanılır", async () => {
    const { authClient } = await load();
    const calls = mockFetch(backend("USER"));
    const session = await authClient.login("student", "ok");
    expect(session.user).toEqual({ id: "1", username: "student", name: "Aysel Məmmədova", email: "student@apilab.az", role: "student", initials: "AM" });
    expect(session).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-1" });
    expect(calls[1]).toMatchObject({ url: "/api/v1/auth/me", headers: { authorization: "Bearer access-1" } });
    expect(JSON.parse(localStorage.getItem("api-lab-session")!).accessToken).toBe("access-1");
  });

  it("ADMIN → admin", async () => {
    const { authClient } = await load();
    mockFetch(backend("ADMIN"));
    expect((await authClient.login("admin", "ok")).user.role).toBe("admin");
  });

  it("səhv parol → AuthClientError (backend kodu və traceId ilə), sessiya yaranmır", async () => {
    const { authClient, AuthClientError } = await load();
    mockFetch(backend());
    const error = await authClient.login("student", "bad").catch((e) => e);
    expect(error).toBeInstanceOf(AuthClientError);
    expect(error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", traceId: "trace_INVALID_CREDENTIALS" });
    expect(authClient.getStoredSession()).toBeNull();
  });

  it("429 → retryAfter Retry-After başlığından", async () => {
    const { authClient } = await load();
    mockFetch(() => json(429, apiError(429, "TOO_MANY_REQUESTS"), { "Retry-After": "17" }));
    await expect(authClient.login("student", "ok")).rejects.toMatchObject({ status: 429, retryAfter: 17 });
  });
});

describe("refresh və 401", () => {
  it("refresh rotation: yeni access + refresh token saxlanılır", async () => {
    const { authClient } = await load();
    mockFetch(backend());
    await authClient.login("student", "ok");
    const refreshed = await authClient.refreshSession();
    expect(refreshed).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2" });
    expect(authClient.getStoredSession()?.refreshToken).toBe("refresh-2");
  });

  it("401 olan API sorğusu avtomatik refresh edir və təkrarlanır", async () => {
    const auth = await load();
    const { api } = await import("../lib/http");
    const handler = backend();
    mockFetch((call) => (call.url.endsWith("/api/v1/cards") ? (call.headers.authorization === "Bearer access-2" ? json(200, { items: [] }) : json(401, apiError(401, "TOKEN_EXPIRED"))) : handler(call)));
    await auth.authClient.login("student", "ok");
    const result = await api.get<{ items: unknown[] }>("/api/v1/cards");
    expect(result.data.items).toEqual([]);
    expect(auth.authClient.getStoredSession()?.accessToken).toBe("access-2");
  });

  it("refresh uğursuz → sessiya silinir və listener xəbər tutur", async () => {
    const { authClient, onSessionChange } = await load();
    mockFetch(backend());
    await authClient.login("student", "ok");
    localStorage.setItem("api-lab-session", JSON.stringify({ ...authClient.getStoredSession(), refreshToken: "stolen" }));
    vi.resetModules();
    const fresh = await import("./auth");
    const changes: unknown[] = [];
    fresh.onSessionChange((s) => changes.push(s));
    void onSessionChange;
    await expect(fresh.authClient.refreshSession()).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    expect(fresh.authClient.getStoredSession()).toBeNull();
    expect(changes).toEqual([null]);
  });

  it("signOut refresh token-i server tərəfdə ləğv edir (POST /auth/logout)", async () => {
    const { authClient } = await load();
    const calls = mockFetch(backend());
    await authClient.login("student", "ok");
    await authClient.signOut();
    const logout = calls.find((c) => c.url.endsWith("/auth/logout"))!;
    expect(JSON.parse(logout.body!)).toEqual({ refresh_token: "refresh-1" });
    expect(logout.headers.authorization).toBe("Bearer access-1");
    expect(authClient.getStoredSession()).toBeNull();
  });
});

describe("OAuth2 Authorization Code (mock Google)", () => {
  function provider(overrides: { state?: string } = {}) {
    return (call: MockCall) => {
      const url = new URL(call.url, "http://localhost:3000");
      if (url.pathname === "/oauth/authorize" && call.method === "GET") {
        return json(200, { client: { clientId: "apilab-portal", name: "API Lab Portal" }, redirectUri: url.searchParams.get("redirect_uri"), scope: "openid", state: url.searchParams.get("state"), accounts: [{ username: "student", fullName: "Aysel Məmmədova", email: "student@apilab.az" }] });
      }
      if (url.pathname === "/oauth/authorize") {
        const form = new URLSearchParams(call.body);
        const location = new URL(form.get("redirect_uri")!);
        location.searchParams.set("state", overrides.state ?? form.get("state")!);
        location.searchParams.set("code", "ac_123");
        return json(200, { location: location.toString() });
      }
      if (url.pathname === "/oauth/token") return json(200, { access_token: "oauth-access", token_type: "Bearer", expires_in: 900, scope: "openid accounts:read" });
      if (url.pathname === "/oauth/userinfo") return json(200, { sub: "1" });
      if (url.pathname === "/api/v1/auth/me") return json(200, profile("USER"));
      return json(404, apiError(404, "ROUTE_NOT_FOUND"));
    };
  }

  it("authorize → hesablar real provider-dən; consent → code; token → userinfo → sessiya (refresh token yoxdur)", async () => {
    const { authClient, OAUTH_REDIRECT_URI } = await load();
    const calls = mockFetch(provider());
    const { state, accounts } = await authClient.authorizeGoogle();
    expect(accounts).toEqual([{ id: "student", username: "student", name: "Aysel Məmmədova", email: "student@apilab.az", initials: "AM" }]);
    const session = await authClient.exchangeGoogleCode(accounts[0], "student123", state);
    expect(session).toMatchObject({ accessToken: "oauth-access", refreshToken: null, user: { role: "student" } });
    expect(OAUTH_REDIRECT_URI).toBe("http://localhost:3000/oauth/callback");
    const token = new URLSearchParams(calls.find((c) => c.url.endsWith("/oauth/token"))!.body);
    expect(Object.fromEntries(token)).toMatchObject({ grant_type: "authorization_code", code: "ac_123", redirect_uri: OAUTH_REDIRECT_URI, client_id: "apilab-portal" });
    expect(calls.map((c) => `${c.method} ${new URL(c.url, "http://x").pathname}`)).toEqual(["GET /oauth/authorize", "POST /oauth/authorize", "POST /oauth/token", "GET /oauth/userinfo", "GET /api/v1/auth/me"]);
  });

  it("state uyğun gəlmirsə (CSRF) → INVALID_OAUTH_STATE, token istənilmir", async () => {
    const { authClient } = await load();
    const calls = mockFetch(provider({ state: "attacker-state" }));
    const { state, accounts } = await authClient.authorizeGoogle();
    await expect(authClient.exchangeGoogleCode(accounts[0], "x", state)).rejects.toMatchObject({ code: "INVALID_OAUTH_STATE" });
    expect(calls.some((c) => c.url.endsWith("/oauth/token"))).toBe(false);
  });
});

describe("səssiz refresh və OAuth refresh token", () => {
  it("access token bitməzdən 60 san əvvəl refresh avtomatik çağırılır (UI-sız)", async () => {
    vi.useFakeTimers();
    try {
      const { authClient, SILENT_REFRESH_MARGIN_MS } = await load();
      const calls = mockFetch(backend());
      await authClient.login("student", "ok"); // expires_in: 900 san
      expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(900_000 - SILENT_REFRESH_MARGIN_MS - 1_000);
      expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
      expect(authClient.getStoredSession()?.accessToken).toBe("access-2");
      // yeni sessiya üçün yeni taymer qurulub
      await vi.advanceTimersByTimeAsync(900_000);
      expect(authClient.getStoredSession()?.accessToken).toBe("access-3");
    } finally {
      vi.useRealTimers();
    }
  });

  it("səhifə yenidən açılanda saxlanmış sessiya üçün də taymer qurulur; vaxtı keçibsə dərhal yenilənir", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem("api-lab-session", JSON.stringify({ user: { id: "1" }, accessToken: "access-1", refreshToken: "refresh-1", expiresAt: Date.now() - 1000, scope: [] }));
      const calls = mockFetch(backend());
      const { authClient } = await load();
      await vi.advanceTimersByTimeAsync(10);
      expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
      expect(authClient.getStoredSession()?.accessToken).toBe("access-2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("OAuth girişində refresh token saxlanılır", async () => {
    const { authClient } = await load();
    mockFetch((call) => {
      const path = new URL(call.url, "http://x").pathname;
      if (path === "/oauth/authorize" && call.method === "GET") return json(200, { client: { clientId: "c", name: "n" }, accounts: [{ username: "student", fullName: "Aysel Məmmədova", email: "s@x" }] });
      if (path === "/oauth/authorize") {
        const form = new URLSearchParams(call.body);
        return json(200, { location: `${form.get("redirect_uri")}?state=${form.get("state")}&code=ac_1` });
      }
      if (path === "/oauth/token") return json(200, { access_token: "oa-1", refresh_token: "rt_oauth", token_type: "Bearer", expires_in: 900, scope: "openid" });
      if (path === "/oauth/userinfo") return json(200, { sub: "1" });
      return json(200, profile("USER"));
    });
    const { state, accounts } = await authClient.authorizeGoogle();
    const session = await authClient.exchangeGoogleCode(accounts[0], "student123", state);
    expect(session.refreshToken).toBe("rt_oauth");
  });
});
