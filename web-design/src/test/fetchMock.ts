// fetch mock köməkçisi: hər çağırış qeydə alınır, cavablar ardıcıllıqla və ya funksiya ilə verilir.
import { vi } from "vitest";

export type MockCall = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": `req_${status}`, ...headers },
  });
}

export const apiError = (status: number, code: string, message = code, extra: Record<string, unknown> = {}) => ({
  timestamp: "2026-10-13T09:00:00Z",
  status,
  code,
  message,
  details: [],
  traceId: `trace_${code}`,
  ...extra,
});

export function mockFetch(handler: (call: MockCall) => Response | Promise<Response>) {
  const calls: MockCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key.toLowerCase()] = value));
    const call = { url: String(input), method: (init?.method ?? "GET").toUpperCase(), headers, body: init?.body ? String(init.body) : undefined };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
