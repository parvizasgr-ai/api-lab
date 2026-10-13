// Real autentifikasiya — API Lab backend (/api/openapi.json):
//   POST /api/v1/auth/login | refresh | logout, GET /api/v1/auth/me
//   GET/POST /oauth/authorize (JSON rejimi), POST /oauth/token, GET /oauth/userinfo — mock "Google" provider
import { AuthClientError, BASE_URL, SERVER_URL, api, request, setAuthProvider, type NetworkCall } from "../lib/http";

export { AuthClientError, BASE_URL };

export const AUTH_ENDPOINTS = {
  login: `${BASE_URL}/v1/auth/login`,
  refresh: `${BASE_URL}/v1/auth/refresh`,
  logout: `${BASE_URL}/v1/auth/logout`,
  me: `${BASE_URL}/v1/auth/me`,
  authorize: `${SERVER_URL}/oauth/authorize`,
  token: `${SERVER_URL}/oauth/token`,
  userInfo: `${SERVER_URL}/oauth/userinfo`,
} as const;

// Mock provider-in client-i (seed: oauth_clients). Real SPA-da client secret olmaz — PKCE istifadə olunur.
const OAUTH_CLIENT_ID: string = import.meta.env.VITE_OAUTH_CLIENT_ID ?? "apilab-portal";
const OAUTH_CLIENT_SECRET: string = import.meta.env.VITE_OAUTH_CLIENT_SECRET ?? "apilab-portal-secret";
// Seed-də qeydiyyatlı: http://localhost:5173/oauth/callback (dev) və http://localhost:3000/oauth/callback (server)
export const OAUTH_REDIRECT_URI = `${window.location.origin}/oauth/callback`;
// Provider yalnız istifadəçinin həqiqətən malik olduğu scope-ları verir (admin heç vaxt)
const OAUTH_SCOPE = "openid profile email accounts:read cards:read cards:write transfers:write bookings:read bookings:write books:write music:read music:write";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "student" | "admin";
  initials: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string | null; // OAuth ilə daxil olanda refresh token verilmir
  expiresAt: number;
  scope: string[];
};

export type GoogleAccount = Omit<AuthUser, "role" | "id"> & { id: string };

// Backend rolları → portal rolları
export const mapRole = (role: string): AuthUser["role"] => (role === "ADMIN" ? "admin" : "student");
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string };
type Profile = { id: number; username: string; fullName: string; email: string; role: string; scopes: string[] };

const SESSION_KEY = "api-lab-session";
let memorySession: AuthSession | null = null;
const sessionListeners = new Set<(session: AuthSession | null) => void>();

function storeSession(session: AuthSession | null) {
  memorySession = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage bloklanıbsa sessiya yaddaşda qalır.
  }
  sessionListeners.forEach((listener) => listener(session));
}

function getStoredSession(): AuthSession | null {
  if (memorySession) return memorySession;
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as AuthSession;
    if (!parsed.user || !parsed.accessToken || !parsed.expiresAt) return null;
    memorySession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

// Sessiya dəyişəndə (login, refresh, logout, refresh uğursuz) App xəbər tutsun
export function onSessionChange(listener: (session: AuthSession | null) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

async function buildSession(tokens: TokenResponse, refreshToken: string | null): Promise<AuthSession> {
  const { data: me } = await request<Profile>("GET", AUTH_ENDPOINTS.me, { token: tokens.access_token });
  return {
    user: { id: String(me.id), username: me.username, name: me.fullName, email: me.email, role: mapRole(me.role), initials: initialsOf(me.fullName) },
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope.split(" ").filter(Boolean),
  };
}

async function login(username: string, password: string): Promise<AuthSession> {
  const { data } = await request<TokenResponse>("POST", AUTH_ENDPOINTS.login, { body: { username, password }, auth: false });
  const session = await buildSession(data, data.refresh_token ?? null);
  storeSession(session);
  return session;
}

// Refresh token rotation: köhnə refresh token ləğv olunur, yeni cüt gəlir
let refreshing: Promise<AuthSession> | null = null;
function refreshSession(): Promise<AuthSession> {
  refreshing ??= (async () => {
    const current = getStoredSession();
    if (!current?.refreshToken) {
      storeSession(null);
      throw new AuthClientError("Refresh token yoxdur — yenidən daxil olun", 401, "INVALID_REFRESH_TOKEN", "");
    }
    try {
      const { data } = await request<TokenResponse>("POST", AUTH_ENDPOINTS.refresh, { body: { refresh_token: current.refreshToken }, auth: false });
      const session = { ...current, accessToken: data.access_token, refreshToken: data.refresh_token ?? null, expiresAt: Date.now() + data.expires_in * 1000, scope: data.scope.split(" ").filter(Boolean) };
      storeSession(session);
      return session;
    } catch (error) {
      storeSession(null); // refresh uğursuz → sessiya bitib
      throw error;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function signOut() {
  const current = getStoredSession();
  storeSession(null);
  if (current?.refreshToken) {
    // Logout refresh token-i server tərəfdə ləğv edir; xəta olsa da lokal sessiya artıq silinib
    await request("POST", AUTH_ENDPOINTS.logout, { body: { refresh_token: current.refreshToken }, token: current.accessToken, retryOn401: false }).catch(() => undefined);
  }
}

setAuthProvider({
  getAccessToken: () => getStoredSession()?.accessToken ?? null,
  canRefresh: () => Boolean(getStoredSession()?.refreshToken),
  refresh: refreshSession,
});

// ---------------------------------------------------------------- OAuth2 Authorization Code (mock Google)
type ConsentInfo = { client: { clientId: string; name: string }; state: string; accounts: { username: string; fullName: string; email: string }[] };

const randomState = () => `st_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

async function authorizeGoogle(): Promise<{ state: string; accounts: GoogleAccount[]; clientName: string }> {
  const state = randomState();
  const params = new URLSearchParams({ response_type: "code", client_id: OAUTH_CLIENT_ID, redirect_uri: OAUTH_REDIRECT_URI, scope: OAUTH_SCOPE, state });
  const { data } = await request<ConsentInfo>("GET", `${AUTH_ENDPOINTS.authorize}?${params}`, { auth: false });
  return {
    state,
    clientName: data.client.name,
    accounts: data.accounts.map((a) => ({ id: a.username, username: a.username, name: a.fullName, email: a.email, initials: initialsOf(a.fullName) })),
  };
}

// Consent qərarı → provider redirect_uri?code=...&state=... qaytarır (JSON rejimində {location})
async function decideConsent(account: GoogleAccount | null, password: string, state: string, decision: "allow" | "deny"): Promise<URL> {
  const { data } = await request<{ location: string }>("POST", AUTH_ENDPOINTS.authorize, {
    auth: false,
    form: { client_id: OAUTH_CLIENT_ID, redirect_uri: OAUTH_REDIRECT_URI, scope: OAUTH_SCOPE, state, username: account?.username ?? "student", password, decision },
  });
  const location = new URL(data.location);
  // CSRF qoruması: geri qayıdan state bizim göndərdiyimizlə eyni olmalıdır
  if (location.searchParams.get("state") !== state) {
    throw new AuthClientError("state uyğun gəlmir — sorğu saxtalaşdırılıb", 400, "INVALID_OAUTH_STATE", "");
  }
  return location;
}

async function denyGoogle(state: string): Promise<void> {
  await decideConsent(null, "", state, "deny");
}

async function exchangeGoogleCode(account: GoogleAccount, password: string, state: string): Promise<AuthSession> {
  const location = await decideConsent(account, password, state, "allow");
  const code = location.searchParams.get("code");
  if (!code) throw new AuthClientError("Authorization code alınmadı", 400, location.searchParams.get("error") ?? "NO_CODE", "");
  const data = await tokenForCode(code);
  await request("GET", AUTH_ENDPOINTS.userInfo, { token: data.access_token });
  const session = await buildSession(data, null);
  storeSession(session);
  return session;
}

// Apps → "Google ilə daxil ol" demo-su: axını addım-addım göstərir, əsas sessiyanı DƏYİŞMİR
async function tokenForCode(code: string) {
  const { data } = await request<TokenResponse>("POST", AUTH_ENDPOINTS.token, {
    auth: false,
    form: { grant_type: "authorization_code", code, redirect_uri: OAUTH_REDIRECT_URI, client_id: OAUTH_CLIENT_ID, client_secret: OAUTH_CLIENT_SECRET },
  });
  return data;
}
export const oauthDemo = {
  authorize: authorizeGoogle,
  consent: async (account: GoogleAccount, password: string, state: string) => {
    const location = await decideConsent(account, password, state, "allow");
    return location.searchParams.get("code") ?? "";
  },
  token: async (code: string) => (await tokenForCode(code)).access_token,
};

// Auth Lab üçün: əsas sessiyaya toxunmadan token al / yenilə
async function labLogin(username: string, password: string) {
  return (await request<TokenResponse>("POST", AUTH_ENDPOINTS.login, { body: { username, password }, auth: false })).data;
}
async function labRefresh(refreshToken: string) {
  return (await request<TokenResponse>("POST", AUTH_ENDPOINTS.refresh, { body: { refresh_token: refreshToken }, auth: false })).data;
}

export const authClient = {
  authorizeGoogle,
  denyGoogle,
  exchangeGoogleCode,
  getStoredSession,
  login,
  refreshSession,
  signOut,
  labLogin,
  labRefresh,
};

export type { NetworkCall };
export { api };
