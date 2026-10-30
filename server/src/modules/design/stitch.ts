// Google Stitch MCP client (https://stitch.googleapis.com/mcp) — JSON-RPC 2.0 üzərindən `tools/call`.
// Server "stateless"-dir: initialize/sessiya lazım deyil, hər çağırış müstəqil POST-dur. Açar: X-Goog-Api-Key (yalnız serverdə).
//
// Stitch alətləri: create_project, generate_screen_from_text, edit_screens, list_screens, get_screen, download_file …
// generate/edit bir neçə dəqiqə çəkir; Stitch-in öz tövsiyəsi: timeout olsa TƏKRAR GÖNDƏRMƏ (kredit yenidən xərclənər),
// əvəzində ekranı get_screen / list_screens ilə hər 30 saniyədən bir yoxla.

export type StitchErrorKind = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID' | 'UPSTREAM';

export class StitchError extends Error {
  constructor(
    public kind: StitchErrorKind,
    message: string,
  ) {
    super(message);
  }
}

// Transport ayrıdır: testlərdə saxta Stitch verilir (real Google-a sorğu getmir, kredit xərclənmir)
export type StitchTransport = (tool: string, args: Record<string, unknown>, timeoutMs: number) => Promise<Record<string, any>>; // MCP structuredContent sərbəst JSON-dur

const classify = (text: string): StitchErrorKind =>
  /RESOURCE_EXHAUSTED|quota|rate limit|too many requests|429/i.test(text)
    ? 'RATE_LIMIT'
    : /UNAUTHENTICATED|PERMISSION_DENIED|API key|401|403/i.test(text)
      ? 'AUTH'
      : /INVALID_ARGUMENT|400/i.test(text)
        ? 'INVALID'
        : /DEADLINE_EXCEEDED|timed? ?out/i.test(text)
          ? 'TIMEOUT'
          : 'UPSTREAM';

export function httpTransport(apiKey: string, endpoint: string): StitchTransport {
  let id = 0;
  return async (tool, args, timeoutMs) => {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Goog-Api-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: tool, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const e = err as Error;
      throw new StitchError(e.name === 'TimeoutError' || e.name === 'AbortError' ? 'TIMEOUT' : 'UPSTREAM', `${tool}: ${e.message}`);
    }
    if (res.status === 401 || res.status === 403) throw new StitchError('AUTH', `${tool}: HTTP ${res.status}`);
    if (res.status === 429) throw new StitchError('RATE_LIMIT', `${tool}: HTTP 429`);
    if (res.status === 504) throw new StitchError('TIMEOUT', `${tool}: HTTP 504`);
    if (!res.ok) throw new StitchError(res.status === 400 ? 'INVALID' : 'UPSTREAM', `${tool}: HTTP ${res.status}`);
    const body = (await res.json()) as { error?: { message?: string }; result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text?: string }[] } };
    if (body.error) throw new StitchError(classify(body.error.message ?? ''), `${tool}: ${body.error.message}`);
    const text = body.result?.content?.map((c) => c.text ?? '').join('\n') ?? '';
    if (body.result?.isError) throw new StitchError(classify(text), `${tool}: ${text.slice(0, 300)}`);
    if (body.result?.structuredContent) return body.result.structuredContent;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  };
}

export interface StitchScreen {
  id: string;
  htmlFile: string | null;
  title: string | null;
}

export interface GenerationResult {
  screen: StitchScreen;
  message: string | null;
  suggestions: string[];
}

interface ScreenJson {
  id?: string;
  name?: string;
  title?: string;
  htmlCode?: { name?: string };
}

const toScreen = (s: ScreenJson): StitchScreen => ({ id: s.id ?? s.name?.split('/').pop() ?? '', htmlFile: s.htmlCode?.name ?? null, title: s.title ?? null });

// generate / edit cavabı: outputComponents[] — design.screens[], text, suggestion
function parseGeneration(out: Record<string, any>): GenerationResult | null { // MCP cavabı
  const components = (out.outputComponents ?? []) as { design?: { screens?: ScreenJson[] }; text?: string; suggestion?: string }[];
  const screens = components.flatMap((c) => c.design?.screens ?? []).filter((s) => s.id || s.name);
  if (!screens.length) return null;
  const texts = components.map((c) => c.text).filter((t): t is string => !!t);
  return {
    screen: toScreen(screens[screens.length - 1]),
    message: texts.join('\n\n') || null,
    suggestions: components.map((c) => c.suggestion).filter((s): s is string => !!s).slice(0, 4),
  };
}

export class StitchClient {
  constructor(
    private transport: StitchTransport,
    private options: { modelId: string; callTimeoutMs: number; pollIntervalMs: number; pollAttempts: number },
    private wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async createProject(title: string): Promise<string> {
    const out = await this.transport('create_project', { title }, 30_000);
    const name = String(out.name ?? '');
    if (!name.startsWith('projects/')) throw new StitchError('UPSTREAM', 'create_project: layihə adı qaytarılmadı');
    return name.slice('projects/'.length);
  }

  async listScreenIds(projectId: string): Promise<string[]> {
    const out = await this.transport('list_screens', { projectId }, 30_000);
    return ((out.screens ?? []) as ScreenJson[]).map((s) => toScreen(s).id);
  }

  async getScreen(projectId: string, screenId: string): Promise<StitchScreen> {
    return toScreen((await this.transport('get_screen', { name: `projects/${projectId}/screens/${screenId}` }, 30_000)) as ScreenJson);
  }

  async downloadHtml(fileName: string): Promise<string> {
    const out = await this.transport('download_file', { name: fileName }, 60_000);
    if (typeof out.html !== 'string' || !out.html) throw new StitchError('UPSTREAM', 'download_file: HTML boşdur');
    return out.html;
  }

  generate(projectId: string, prompt: string, deviceType: string): Promise<GenerationResult> {
    return this.run(projectId, () =>
      this.transport('generate_screen_from_text', { projectId, prompt, deviceType, modelId: this.options.modelId }, this.options.callTimeoutMs),
    );
  }

  edit(projectId: string, screenId: string, prompt: string, deviceType: string): Promise<GenerationResult> {
    return this.run(projectId, () =>
      this.transport('edit_screens', { projectId, selectedScreenIds: [screenId], prompt, deviceType, modelId: this.options.modelId }, this.options.callTimeoutMs),
    );
  }

  // Uzun çağırış; timeout / bağlantı xətasında TƏKRAR GÖNDƏRİLMİR — yeni ekran list_screens ilə gözlənilir (polling)
  private async run(projectId: string, call: () => Promise<Record<string, unknown>>): Promise<GenerationResult> {
    const before = new Set(await this.listScreenIds(projectId));
    try {
      const result = parseGeneration(await call());
      if (result) return result;
      // Model ekran əvəzinə sual/mətn qaytarıbsa
      throw new StitchError('INVALID', 'Stitch ekran yaratmadı — təsviri daha konkret yazın');
    } catch (err) {
      if (!(err instanceof StitchError) || (err.kind !== 'TIMEOUT' && err.kind !== 'UPSTREAM')) throw err;
      for (let i = 0; i < this.options.pollAttempts; i++) {
        await this.wait(this.options.pollIntervalMs);
        const fresh = (await this.listScreenIds(projectId).catch(() => [])).filter((id) => !before.has(id));
        if (fresh.length) {
          const screen = await this.getScreen(projectId, fresh[fresh.length - 1]);
          if (screen.htmlFile) return { screen, message: null, suggestions: [] };
        }
      }
      throw new StitchError('TIMEOUT', 'Stitch ayrılmış vaxtda nəticə qaytarmadı');
    }
  }
}
