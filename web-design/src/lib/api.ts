export type DemoUser = {
  username: string;
  password: string;
  role: "student" | "admin" | "instructor";
};

export type HomeData = {
  baseUrl: string;
  curl: string;
  users: DemoUser[];
};

export type ExplorerRequest = {
  method: string;
  url: string;
  body?: string;
};

export type ExplorerResponse = {
  status: number;
  statusText: string;
  time: number;
  size: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  errorCode?: string;
  traceId?: string;
  retryAfter?: number;
};

export type NetworkCall = {
  id: string;
  method: string;
  url: string;
  status: number;
  time: number;
  type?: "BFF";
  internalCalls?: Omit<NetworkCall, "internalCalls">[];
};

const homeData: HomeData = {
  baseUrl: "https://api.apilab.az/v1",
  curl:
    'curl -X GET https://api.apilab.az/v1/users -H "Accept: application/json"',
  users: [
    { username: "student", password: "student123", role: "student" },
    { username: "admin", password: "admin123", role: "admin" },
    { username: "rauf", password: "rauf123", role: "instructor" },
  ],
};

async function mockRequest<T>(payload: T): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  return structuredClone(payload);
}

async function sendExplorerRequest(
  request: ExplorerRequest,
): Promise<ExplorerResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 900));

  if (request.url.includes("rate-limit")) {
    return {
      status: 429,
      statusText: "Too Many Requests",
      time: 54,
      size: "248 B",
      body: {
        error: "rate_limit_exceeded",
        message: "Too many requests. Retry after 10 seconds.",
      },
      headers: {
        "content-type": "application/json",
        "retry-after": "10",
        "x-ratelimit-limit": "60",
      },
      retryAfter: 10,
    };
  }

  if (request.url.includes("broken")) {
    return {
      status: 500,
      statusText: "Internal Server Error",
      time: 183,
      size: "312 B",
      body: {
        error: "upstream_service_error",
        message: "The training service could not complete this request.",
      },
      headers: {
        "content-type": "application/json",
        "x-trace-id": "trc_8f2a91c4d7",
      },
      errorCode: "UPSTREAM_SERVICE_ERROR",
      traceId: "trc_8f2a91c4d7",
    };
  }

  return {
    status: request.method === "POST" ? 201 : 200,
    statusText: request.method === "POST" ? "Created" : "OK",
    time: 42,
    size: "1.24 KB",
    body: {
      data: [
        { id: 1, name: "Aylin", role: "student" },
        { id: 2, name: "Rauf", role: "instructor" },
      ],
      meta: { total: 2, page: 1 },
    },
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-ratelimit-remaining": "59",
      "cache-control": "no-store",
    },
  };
}

async function runAppCall(call: NetworkCall): Promise<NetworkCall> {
  await new Promise((resolve) => window.setTimeout(resolve, 420));
  return structuredClone(call);
}

export const apiClient = {
  getHomeData: () => mockRequest(homeData),
  sendExplorerRequest,
  runAppCall,
};
