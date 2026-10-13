// External API proxy — tələbənin sorğusunu RapidAPI-yə ötürür, amma YALNIZ kataloqdakı host/path/query ilə (SSRF qoruması).
//   1. Xam URL yoxlanılır: .., //, @, \, %2e, %2f, %5c, %40, CR/LF → 400 EXTERNAL_PATH_REJECTED
//   2. Upstream path kataloq şablonundan qurulur, parametrlər pattern ilə yoxlanılır, sonra şablona yenidən uyğunlaşdırılır
//   3. URL həmişə https://<kataloq host>; redirect izlənmir (redirect: 'error')
//   4. Upstream-ə yalnız seçilmiş header-lər gedir (Authorization, Cookie, X-Forwarded-For və s. ötürülmür)
//   5. Key: tələbənin X-RapidAPI-Key başlığı (heç yerdə saxlanmır); server key yalnız admin açıbsa + hard-limit API + login olunub
//   6. Timeout, cavab ölçüsü limiti, qısa GET cache, upstream 401/403/429/5xx → 502/504 (vahid xəta formatı)
import type { Request, RequestHandler, Response } from 'express';
import type { Config } from '../../config.js';
import { ApiError } from '../../errors.js';
import { sha256 } from '../../lib/crypto.js';
import { findApi, findEndpoint, type ExternalApi, type ExternalEndpoint } from './catalog.js';

// Xam URL-də (decode-dan ƏVVƏL) qadağan olunan ardıcıllıqlar
const FORBIDDEN_RAW = [/\.\./, /\/\//, /@/, /\\/, /%2e/i, /%2f/i, /%5c/i, /%40/i, /%0d/i, /%0a/i, /%00/i, /[\r\n]/];

export function pathGuard(): RequestHandler {
  return (req, _res, next) => {
    const raw = req.originalUrl.split('?')[0];
    if (FORBIDDEN_RAW.some((re) => re.test(raw))) {
      throw new ApiError(400, 'EXTERNAL_PATH_REJECTED', 'Yol icazəsiz simvollar daşıyır (.., //, @, \\, kodlaşdırılmış / və ya . , CR/LF)', [
        { field: 'path', message: 'Proxy yalnız kataloqdakı path pattern-lərini qəbul edir' },
      ]);
    }
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    if (/%0d|%0a|%00|[\r\n]/i.test(query)) {
      throw new ApiError(400, 'EXTERNAL_PATH_REJECTED', 'Query-də idarəedici simvollar (CR/LF/NUL) icazəli deyil');
    }
    next();
  };
}

export const templateRegex = (endpoint: ExternalEndpoint) =>
  new RegExp(
    `^${endpoint.upstream
      .split(/(\{[^}]+\})/)
      .map((part) => (part.startsWith('{') ? `(?<${part.slice(1, -1)}>[^/]+)` : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('')}$`,
  );

// Kataloq şablonu + yoxlanmış parametrlər → upstream URL (yalnız kataloq host-u)
export function buildUpstreamUrl(api: ExternalApi, endpoint: ExternalEndpoint, params: Record<string, unknown>, query: Record<string, unknown>): URL {
  const path = endpoint.upstream.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = String(params[name] ?? '');
    const pattern = endpoint.params?.[name];
    if (!pattern || !pattern.test(value)) throw new ApiError(400, 'EXTERNAL_PATH_REJECTED', `Path parametri icazəli formada deyil: ${name}`);
    return encodeURIComponent(value);
  });
  // Müdafiə qatı: qurulmuş yol yenə şablona uyğun olmalıdır və qadağan ardıcıllıq daşımamalıdır
  if (!templateRegex(endpoint).test(path) || FORBIDDEN_RAW.some((re) => re.test(path))) {
    throw new ApiError(400, 'EXTERNAL_PATH_REJECTED', 'Yol kataloq pattern-inə uyğun deyil');
  }
  const url = new URL(`https://${api.host}${path}`);
  if (url.protocol !== 'https:' || url.host !== api.host || url.username || url.password) {
    throw new ApiError(400, 'EXTERNAL_PATH_REJECTED', 'Upstream ünvanı kataloqdan kənardadır');
  }
  for (const name of endpoint.query) {
    const value = query[name];
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  return url;
}

// Log/xəta üçün açarın maskalanmış forması — açar heç vaxt tam yazılmır
export const maskKey = (key: string) => (key.length <= 8 ? '***' : `${key.slice(0, 4)}…${key.slice(-2)} (${key.length})`);

type KeySource = 'student' | 'server';

function chooseKey(req: Request, api: ExternalApi, config: Config): { key: string; source: KeySource } {
  const student = req.get('x-rapidapi-key')?.trim();
  if (student) return { key: student, source: 'student' };
  const { serverKey, serverKeyEnabled } = config.external;
  if (serverKeyEnabled && serverKey && api.hardLimit && req.auth) return { key: serverKey, source: 'server' };
  const why = !serverKeyEnabled || !serverKey
    ? 'Server key söndürülüb (standart rejim)'
    : !api.hardLimit
      ? 'Server key yalnız Hard Limit-li API-lər üçündür'
      : 'Server key yalnız daxil olmuş istifadəçilər üçündür';
  throw new ApiError(503, 'EXTERNAL_KEY_MISSING', 'RapidAPI key yoxdur — öz açarınızı X-RapidAPI-Key başlığı ilə göndərin', [
    { field: 'header X-RapidAPI-Key', message: `${why}. Açarı rapidapi.com → Apps → Authorization bölməsindən alın.` },
  ]);
}

// Upstream cavabından ötürülən content-type-lar; qalanı application/octet-stream (+ nosniff). SVG/HTML ötürülmür (XSS).
const SAFE_TYPES = ['application/json', 'text/plain', 'image/png', 'image/jpeg', 'image/gif'];

interface CachedResponse {
  status: number;
  contentType: string;
  body: Buffer;
  rateLimit: { limit?: string; remaining?: string };
  expiresAt: number;
}

async function readLimited(res: globalThis.Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new ApiError(502, 'EXTERNAL_RESPONSE_TOO_LARGE', `Upstream cavabı çox böyükdür (> ${Math.round(maxBytes / 1024)} KB)`);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(502, 'EXTERNAL_RESPONSE_TOO_LARGE', `Upstream cavabı çox böyükdür (> ${Math.round(maxBytes / 1024)} KB)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function upstreamError(status: number, bodyText: string, retryAfter: string | null): ApiError {
  const snippet = bodyText.slice(0, 200);
  const details = [{ field: 'upstream', message: `HTTP ${status}${snippet ? `: ${snippet}` : ''}` }];
  if (status === 429) {
    const seconds = Math.max(1, Number(retryAfter) || 60);
    return new ApiError(502, 'EXTERNAL_RATE_LIMITED', `RapidAPI limiti bitib — ${seconds} saniyə sonra yenidən cəhd edin (və ya planınızı yoxlayın)`, details, {
      'Retry-After': String(seconds),
    });
  }
  if (status === 403 && /not subscribed/i.test(bodyText)) {
    return new ApiError(502, 'EXTERNAL_NOT_SUBSCRIBED', 'Bu API-yə abunə deyilsiniz — rapidapi.com-da API səhifəsində "Subscribe to Test" (Basic, $0) seçin', details);
  }
  if (status === 401 || status === 403) {
    return new ApiError(502, 'EXTERNAL_KEY_INVALID', 'RapidAPI key etibarsızdır və ya bu API üçün icazə yoxdur', details);
  }
  return new ApiError(502, 'EXTERNAL_UPSTREAM_ERROR', `Upstream xətası (HTTP ${status})`, details);
}

export class ExternalProxy {
  private cache = new Map<string, CachedResponse>();

  constructor(private config: Config) {}

  get catalog() {
    return this.config.external.catalog;
  }

  // Tələbələr yalnız verified API-ləri görür; ADMIN hamısını (yoxlama vəziyyəti ilə)
  visibleApis(admin: boolean) {
    return this.catalog.filter((api) => admin || api.verified);
  }

  async forward(operationId: string, req: Request, res: Response): Promise<void> {
    const found = findEndpoint(this.catalog, operationId);
    if (!found || !found.api.verified) {
      throw new ApiError(404, 'EXTERNAL_API_NOT_FOUND', 'Bu external API kataloqda aktiv deyil (verified: false)');
    }
    const { api, endpoint } = found;
    const url = buildUpstreamUrl(api, endpoint, req.valid.params, req.valid.query);
    const { key, source } = chooseKey(req, api, this.config);
    res.set({ 'X-External-Api': api.id, 'X-External-Key-Source': source, 'Cache-Control': 'no-store' });

    // Cache açara görə ayrılır (yalnız hash, yaddaşda) — etibarsız açar başqasının cavabını cache-dən almasın
    const cacheKey = `${sha256(key).slice(0, 16)} ${endpoint.method} ${url}`;
    const { cacheTtlSec, timeoutMs, maxResponseBytes } = this.config.external;
    if (endpoint.method === 'GET' && cacheTtlSec > 0) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) return this.send(res, hit, 'HIT');
      if (hit) this.cache.delete(cacheKey);
    }

    // Yalnız seçilmiş header-lər — müştərinin Authorization/Cookie/X-Forwarded-For başlıqları upstream-ə getmir
    const headers: Record<string, string> = {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': api.host,
      Accept: endpoint.produces === 'image' ? 'image/*' : 'application/json',
      'User-Agent': 'API-Lab-Proxy/1.0',
    };
    let body: string | undefined;
    if (endpoint.method === 'POST') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.valid.body ?? {});
    }

    let upstream: globalThis.Response;
    try {
      upstream = await this.config.fetch(url, { method: endpoint.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const timeout = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
      console.error(`[external] ${api.id} ${timeout ? 'timeout' : 'şəbəkə xətası'} (key ${maskKey(key)}):`, (err as Error)?.message);
      if (timeout) throw new ApiError(504, 'EXTERNAL_TIMEOUT', `Upstream ${Math.round(timeoutMs / 1000)} saniyədə cavab vermədi`, [], { 'Retry-After': '5' });
      throw new ApiError(502, 'EXTERNAL_UNAVAILABLE', 'Upstream-ə qoşulmaq olmadı', [{ field: 'upstream', message: api.host }]);
    }

    const buffer = await readLimited(upstream, maxResponseBytes);
    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!upstream.ok) {
      const text = this.scrub(buffer.toString('utf8'), key);
      if (upstream.status >= 500 || upstream.status === 429 || upstream.status === 401 || upstream.status === 403) {
        console.error(`[external] ${api.id} HTTP ${upstream.status} (key ${maskKey(key)})`);
      }
      throw upstreamError(upstream.status, text, upstream.headers.get('retry-after'));
    }
    const isText = contentType === 'application/json' || contentType === 'text/plain';
    const result: CachedResponse = {
      status: upstream.status,
      contentType: SAFE_TYPES.includes(contentType) ? contentType : 'application/octet-stream',
      body: isText ? Buffer.from(this.scrub(buffer.toString('utf8'), key)) : buffer,
      rateLimit: {
        limit: upstream.headers.get('x-ratelimit-requests-limit') ?? undefined,
        remaining: upstream.headers.get('x-ratelimit-requests-remaining') ?? undefined,
      },
      expiresAt: Date.now() + cacheTtlSec * 1000,
    };
    if (endpoint.method === 'GET' && cacheTtlSec > 0) {
      if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!); // ən köhnəsi
      this.cache.set(cacheKey, result);
    }
    this.send(res, result, 'MISS');
  }

  // Upstream cavabı açarı əks etdirsə belə client-ə getməsin
  private scrub(text: string, key: string) {
    return key ? text.split(key).join('***') : text;
  }

  private send(res: Response, r: CachedResponse, cache: 'HIT' | 'MISS') {
    res.set('X-Cache', cache);
    if (r.rateLimit.limit) res.set('X-Upstream-RateLimit-Limit', r.rateLimit.limit);
    if (r.rateLimit.remaining) res.set('X-Upstream-RateLimit-Remaining', r.rateLimit.remaining);
    if (r.contentType === 'application/json') {
      // res.json — Idempotency middleware cavabı saxlaya bilsin (yalnız etibarlı JSON; əks halda xam ötürülür)
      try {
        res.status(r.status).json(JSON.parse(r.body.toString('utf8')));
        return;
      } catch {
        // upstream "application/json" deyib, amma JSON deyil — olduğu kimi
      }
    }
    res.status(r.status).type(r.contentType).send(r.body);
  }
}

export { findApi };
