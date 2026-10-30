// Callbox AI — Google Gemini (@google/genai SDK) inteqrasiyası.
//   * API key yalnız serverdə (GEMINI_API_KEY) — portala, loga, request_log-a heç vaxt düşmür.
//   * 429 (rate limit / kvota) və 503 (model yüklüdür) → exponential backoff + jitter ilə təkrar cəhd;
//     Google cavabında RetryInfo.retryDelay varsa ona hörmət edilir (maksimum gözləmə məhdudlaşdırılır).
//   * Model tapılmadısa (404 — məs. gemini-2.5-flash yeni hesablar üçün bağlanıb) və ya retry-lardan sonra da 429/503-dürsə
//     fallback modelə keçilir.
import { GoogleGenAI } from '@google/genai';
import { ApiError } from '../../errors.js';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiResult {
  text: string;
  model: string;
  attempts: number;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number } | null;
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fallbackModels: string[];
  maxRetries: number; // 429/503 üçün əlavə cəhd sayı
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  systemInstruction: string;
}

// SDK-dan asılılığı ayırırıq: testlərdə saxta generator verilir (real Google-a sorğu getmir)
export type GenerateFn = (req: { model: string; messages: ChatMessage[]; systemInstruction: string; timeoutMs: number }) => Promise<{
  text: string;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}>;

export function sdkGenerator(apiKey: string): GenerateFn {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ model, messages, systemInstruction, timeoutMs }) => {
    const res = await ai.models.generateContent({
      model,
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      config: { systemInstruction, httpOptions: { timeout: timeoutMs } },
    });
    return { text: res.text ?? '', usage: res.usageMetadata };
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// SDK xətasından HTTP status və (varsa) Google-un tövsiyə etdiyi gözləmə
export function errorInfo(err: unknown): { status: number; retryDelayMs: number | null; message: string } {
  const e = err as { status?: number; message?: string; name?: string };
  const message = String(e?.message ?? err);
  const status = typeof e?.status === 'number' ? e.status : e?.name === 'AbortError' || /timed? ?out|aborted/i.test(message) ? 504 : 0;
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  return { status, retryDelayMs: delay ? Math.round(Number(delay[1]) * 1000) : null, message };
}

export function backoffDelay(attempt: number, base: number, max: number, hintMs: number | null, random = Math.random): number {
  if (hintMs !== null) return Math.min(hintMs, max);
  const exp = base * 2 ** attempt; // 1s, 2s, 4s...
  return Math.min(max, Math.round(exp / 2 + random() * (exp / 2))); // "equal jitter" — eyni anda gələn sorğular ayrılır
}

export class GeminiService {
  // 404 verən modellər (məs. gemini-2.5-flash yeni hesablar üçün bağlanıb) yadda saxlanılır — hər sorğuda boş cəhd edilmir
  private unavailable = new Set<string>();

  constructor(
    private options: GeminiOptions,
    private generate: GenerateFn | null = options.apiKey ? sdkGenerator(options.apiKey) : null,
    private wait: (ms: number) => Promise<void> = sleep,
  ) {}

  get configured() {
    return this.generate !== null;
  }

  get model() {
    return [this.options.model, ...this.options.fallbackModels].find((m) => !this.unavailable.has(m)) ?? this.options.model;
  }

  async chat(messages: ChatMessage[]): Promise<GeminiResult> {
    if (!this.generate) {
      throw new ApiError(503, 'AI_NOT_CONFIGURED', 'Callbox AI qoşulmayıb: serverin .env faylında GEMINI_API_KEY yoxdur');
    }
    const all = [...new Set([this.options.model, ...this.options.fallbackModels])];
    const models = all.filter((m) => !this.unavailable.has(m));
    if (!models.length) models.push(...all); // hamısı bağlı görünürsə yenidən yoxla
    let attempts = 0;
    for (const [mi, model] of models.entries()) {
      for (let attempt = 0; ; attempt++) {
        attempts++;
        try {
          const res = await this.generate({ model, messages, systemInstruction: this.options.systemInstruction, timeoutMs: this.options.timeoutMs });
          const u = res.usage;
          return {
            text: res.text.trim() || '(Model boş cavab qaytardı — sualı başqa cür yazın)',
            model,
            attempts,
            usage: u ? { promptTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0, totalTokens: u.totalTokenCount ?? 0 } : null,
          };
        } catch (err) {
          const info = errorInfo(err);
          const retryable = info.status === 429 || info.status === 503;
          if (retryable && attempt < this.options.maxRetries) {
            await this.wait(backoffDelay(attempt, this.options.baseDelayMs, this.options.maxDelayMs, info.retryDelayMs));
            continue;
          }
          if (info.status === 404) this.unavailable.add(model);
          // Növbəti (fallback) model: bu model bağlıdır (404) və ya onun kvotası / yükü retry-lardan sonra da keçmədi
          // (free tier-də kvota model başınadır)
          if ((info.status === 404 || retryable) && mi < models.length - 1) break;
          throw toApiError(info);
        }
      }
    }
    throw new ApiError(502, 'AI_UPSTREAM_ERROR', 'Heç bir Gemini modeli əlçatan deyil');
  }
}

function toApiError(info: { status: number; retryDelayMs: number | null; message: string }): ApiError {
  if (info.status === 429) {
    const retryAfter = Math.max(1, Math.ceil((info.retryDelayMs ?? 30_000) / 1000));
    return new ApiError(429, 'AI_RATE_LIMITED', `Gemini limiti dolub (free tier) — ${retryAfter} saniyə sonra yenidən yazın`, [], { 'Retry-After': String(retryAfter) });
  }
  if (info.status === 400 && /api key|API_KEY/i.test(info.message)) return new ApiError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY etibarsızdır — .env-dəki açarı yoxlayın');
  if (info.status === 401 || info.status === 403) return new ApiError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY-in bu modelə icazəsi yoxdur');
  if (info.status === 400 && /safety|blocked/i.test(info.message)) return new ApiError(422, 'AI_BLOCKED', 'Sorğu təhlükəsizlik filtri ilə bloklandı');
  if (info.status === 504) return new ApiError(504, 'AI_TIMEOUT', 'Gemini vaxtında cavab vermədi — yenidən cəhd edin');
  return new ApiError(502, 'AI_UPSTREAM_ERROR', `Gemini xətası (${info.status || 'şəbəkə'}) — bir az sonra yenidən cəhd edin`);
}
