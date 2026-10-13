export const BASE_URL = "https://api.apilab.az/v1";
export const AUTH_ENDPOINTS = {
  login: `${BASE_URL}/auth/login`,
  refresh: `${BASE_URL}/auth/refresh`,
  authorize: `${BASE_URL}/oauth/authorize`,
  token: `${BASE_URL}/oauth/token`,
  userInfo: `${BASE_URL}/oauth/userinfo`,
} as const;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin" | "instructor";
  initials: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type GoogleAccount = AuthUser;

export class AuthClientError extends Error {
  status: number;
  code: string;
  traceId: string;
  retryAfter?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    traceId: string,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "AuthClientError";
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.retryAfter = retryAfter;
  }
}

const SESSION_KEY = "api-lab-session";
let memorySession: AuthSession | null = null;
let failedLogins = 0;
let rateLimitUntil = 0;

const accounts: GoogleAccount[] = [
  {
    id: "google_aylin",
    name: "Aylin Əliyeva",
    email: "aylin@example.com",
    role: "student",
    initials: "AA",
  },
  {
    id: "google_rauf",
    name: "Rauf Məmmədov",
    email: "rauf@example.com",
    role: "instructor",
    initials: "RM",
  },
  {
    id: "google_admin",
    name: "Admin User",
    email: "admin@apilab.az",
    role: "admin",
    initials: "AU",
  },
];

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function mockAuthRequest(endpoint: string, milliseconds: number) {
  // Keeping the endpoint at this boundary makes replacing the mock with fetch straightforward.
  void endpoint;
  await wait(milliseconds);
}

function createSession(user: AuthUser): AuthSession {
  return {
    user,
    accessToken: `access_${crypto.randomUUID().replaceAll("-", "")}`,
    refreshToken: `refresh_${crypto.randomUUID().replaceAll("-", "")}`,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

function storeSession(session: AuthSession | null) {
  memorySession = session;
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // The in-memory session remains available when storage is blocked.
  }
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

async function login(username: string, password: string): Promise<AuthSession> {
  await mockAuthRequest(AUTH_ENDPOINTS.login, 650);

  if (rateLimitUntil && Date.now() >= rateLimitUntil) {
    rateLimitUntil = 0;
    failedLogins = 0;
  }

  if (rateLimitUntil > Date.now()) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitUntil - Date.now()) / 1000),
    );
    throw new AuthClientError(
      "Too many login attempts",
      429,
      "RATE_LIMIT_EXCEEDED",
      `trc_${crypto.randomUUID().slice(0, 10)}`,
      retryAfter,
    );
  }

  if (failedLogins >= 3) {
    rateLimitUntil = Date.now() + 10_000;
    throw new AuthClientError(
      "Too many login attempts",
      429,
      "RATE_LIMIT_EXCEEDED",
      `trc_${crypto.randomUUID().slice(0, 10)}`,
      10,
    );
  }

  const credentials: Record<string, { password: string; user: AuthUser }> = {
    student: { password: "student123", user: accounts[0] },
    admin: { password: "admin123", user: accounts[2] },
    rauf: { password: "rauf123", user: accounts[1] },
  };
  const match = credentials[username.toLowerCase()];
  if (!match || match.password !== password) {
    failedLogins += 1;
    throw new AuthClientError(
      "Invalid username or password",
      401,
      "INVALID_CREDENTIALS",
      `trc_${crypto.randomUUID().slice(0, 10)}`,
    );
  }

  failedLogins = 0;
  const session = createSession(match.user);
  storeSession(session);
  return session;
}

async function authorizeGoogle(): Promise<{ state: string; accounts: GoogleAccount[] }> {
  await mockAuthRequest(AUTH_ENDPOINTS.authorize, 450);
  return { state: `state_${crypto.randomUUID().slice(0, 12)}`, accounts };
}

async function exchangeGoogleCode(
  account: GoogleAccount,
  state: string,
): Promise<AuthSession> {
  await mockAuthRequest(AUTH_ENDPOINTS.token, 1200);
  if (!state.startsWith("state_")) {
    throw new AuthClientError(
      "Invalid or expired code",
      400,
      "INVALID_OAUTH_STATE",
      `trc_${crypto.randomUUID().slice(0, 10)}`,
    );
  }
  await mockAuthRequest(AUTH_ENDPOINTS.userInfo, 300);
  const session = createSession(account);
  storeSession(session);
  return session;
}

async function refreshSession(): Promise<AuthSession> {
  await mockAuthRequest(AUTH_ENDPOINTS.refresh, 600);
  const current = getStoredSession();
  if (!current?.refreshToken) {
    throw new AuthClientError(
      "Refresh token is missing",
      401,
      "REFRESH_TOKEN_MISSING",
      `trc_${crypto.randomUUID().slice(0, 10)}`,
    );
  }
  const refreshed = {
    ...current,
    accessToken: `access_${crypto.randomUUID().replaceAll("-", "")}`,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  storeSession(refreshed);
  return refreshed;
}

function signOut() {
  storeSession(null);
}

export const authClient = {
  authorizeGoogle,
  exchangeGoogleCode,
  getGoogleAccounts: () => accounts,
  getStoredSession,
  login,
  refreshSession,
  signOut,
};
