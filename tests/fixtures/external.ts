// External API testləri üçün: real RapidAPI-yə HEÇ VAXT getmirik — upstream fetch mock-dur.
import { EXTERNAL_CATALOG, type ExternalApi } from '../../server/src/modules/external/catalog.js';
import { config as baseConfig, type Config } from '../../server/src/config.js';

export const STUDENT_KEY = 'student-rapidapi-key-1234567890abcdef';
export const SERVER_KEY = 'server-rapidapi-key-ZZZZ9999yyyy8888';
export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

export interface UpstreamCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect?: string;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error | ((call: UpstreamCall) => Promise<globalThis.Response> | globalThis.Response);

// Upstream mock: hər çağırışı qeyd edir; default — host-a uyğun 200 JSON (QR üçün PNG)
export function mockUpstream(reply?: Reply) {
  const calls: UpstreamCall[] = [];
  const fetchFn = (async (input: string | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: UpstreamCall = { url: new URL(String(input)), method: init.method ?? 'GET', headers, body: init.body as string | undefined, redirect: init.redirect };
    calls.push(call);
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(call);
    if (call.url.host === 'qr-code-factory.p.rapidapi.com' && !reply) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
    const r = reply ?? {};
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? { ok: true, host: call.url.host, path: call.url.pathname }), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-requests-limit': '1000', 'x-ratelimit-requests-remaining': '999', ...r.headers },
    });
  }) as typeof fetch;
  return { calls, fetchFn };
}

export const verifiedCatalog = (): ExternalApi[] => EXTERNAL_CATALOG.map((api) => ({ ...api, verified: true }));

export function externalConfig(fetchFn: typeof fetch, overrides: Partial<Config['external']> = {}): Partial<Config> {
  return { fetch: fetchFn, external: { ...baseConfig.external, catalog: verifiedCatalog(), serverKey: '', serverKeyEnabled: false, ...overrides } };
}
