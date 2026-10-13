// `npm run external:verify` məntiqi: real RAPIDAPI_KEY ilə hər API-yə BİR sorğu (kataloqdakı nümunə) → status cədvəli
// və verified bayrağı üçün TƏKLİF. catalog.ts-ni avtomatik dəyişmir — qərarı müəllim verir.
import type { ExternalApi } from './catalog.js';
import { buildUpstreamUrl, templateRegex } from './proxy.js';

export type Verdict = 'OK' | 'NOT_SUBSCRIBED' | 'KEY_INVALID' | 'ENDPOINT_NOT_FOUND' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'HOST_NOT_FOUND' | 'TIMEOUT' | 'NETWORK_ERROR';

export interface VerifyRow {
  id: string;
  host: string;
  request: string;
  status: number | null;
  ms: number;
  verdict: Verdict;
  current: boolean;
  proposed: boolean;
  hint: string;
}

const HINTS: Record<Verdict, string> = {
  OK: 'İşləyir — verified: true təklif olunur',
  NOT_SUBSCRIBED: 'rapidapi.com-da bu API-yə abunə olun (Basic, $0), sonra yenidən yoxlayın',
  KEY_INVALID: 'RAPIDAPI_KEY səhvdir (rapidapi.com → Apps → Authorization)',
  ENDPOINT_NOT_FOUND: 'Host işləyir, amma path tapılmadı — catalog.ts-də upstream path-i yoxlayın',
  RATE_LIMITED: 'Limit bitib — qərar vermək olmur, sonra yenidən yoxlayın',
  UPSTREAM_ERROR: 'Upstream xətası (5xx) — sonra yenidən yoxlayın',
  HOST_NOT_FOUND: 'Host mövcud deyil — catalog.ts-də host-u RapidAPI səhifəsindən yoxlayın',
  TIMEOUT: '8 saniyədə cavab yoxdur',
  NETWORK_ERROR: 'Şəbəkə xətası',
};

// Qərar verilə bilməyən hallarda (limit, 5xx, timeout) cari dəyər saxlanılır
const proposal = (verdict: Verdict, current: boolean) =>
  verdict === 'OK' ? true : ['RATE_LIMITED', 'UPSTREAM_ERROR', 'TIMEOUT', 'NETWORK_ERROR'].includes(verdict) ? current : false;

export async function verifyCatalog(catalog: ExternalApi[], key: string, fetchFn: typeof fetch, timeoutMs = 8000): Promise<VerifyRow[]> {
  const rows: VerifyRow[] = [];
  for (const api of catalog) {
    const endpoint = api.endpoints[0];
    const upstreamPath = endpoint.example.path.slice(`/external/${api.id}`.length) || '/';
    const params = templateRegex(endpoint).exec(upstreamPath)?.groups ?? {};
    const url = buildUpstreamUrl(api, endpoint, params, endpoint.example.query ?? {});
    const started = performance.now();
    let status: number | null = null;
    let verdict: Verdict;
    try {
      const res = await fetchFn(url, {
        method: endpoint.method,
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': api.host, ...(endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        body: endpoint.method === 'POST' ? JSON.stringify(endpoint.example.body ?? {}) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      const text = await res.text().catch(() => '');
      if (res.ok) verdict = 'OK';
      else if (res.status === 403 && /not subscribed/i.test(text)) verdict = 'NOT_SUBSCRIBED';
      else if (res.status === 401 || res.status === 403) verdict = 'KEY_INVALID';
      else if (res.status === 404) verdict = 'ENDPOINT_NOT_FOUND';
      else if (res.status === 429) verdict = 'RATE_LIMITED';
      else verdict = 'UPSTREAM_ERROR';
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      verdict = e.name === 'TimeoutError' ? 'TIMEOUT' : e.cause?.code === 'ENOTFOUND' ? 'HOST_NOT_FOUND' : 'NETWORK_ERROR';
    }
    rows.push({
      id: api.id,
      host: api.host,
      request: `${endpoint.method} ${url.pathname}${url.search}`,
      status,
      ms: Math.round(performance.now() - started),
      verdict,
      current: api.verified,
      proposed: proposal(verdict, api.verified),
      hint: HINTS[verdict],
    });
  }
  return rows;
}
