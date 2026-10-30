// Test köməkçiləri: hər test app-i öz təmiz PostgreSQL DB-si (şablondan) və "dondurulmuş" saatı ilə yaranır.
import fs from 'node:fs';
import type { GenerateFn } from '../server/src/modules/ai/gemini.js';
import type { StitchTransport } from '../server/src/modules/design/stitch.js';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../server/src/app.js';
import { config as baseConfig, type Config } from '../server/src/config.js';
import type { DB } from '../server/src/db.js';
import { createTestDb, testView } from './setup/pg.js';
import { ensureSuperadmin } from '../server/src/lib/exposure.js';

export const SUPERADMIN_PASSWORD = 'Muellim-Parol-1';
import type { Handlers } from '../server/src/openapi/router.js';
import { listOperations, loadOpenApi } from '../server/src/openapi/spec.js';
import { ResponseValidator } from '../server/src/openapi/validator.js';
import { AuthService } from '../server/src/modules/auth/service.js';

export const spec = loadOpenApi();
const operations = listOperations(spec);
const responseValidator = new ResponseValidator(spec);

export interface TestClock {
  now: Date;
  advance(seconds: number): void;
}

// Testlərdə real Gemini-yə sorğu getmir: default saxta generator son mesajı əks etdirir
export const fakeGemini: GenerateFn = async ({ model, messages }) => ({
  text: `Test cavabı (${model}): ${messages[messages.length - 1].text}`,
  usage: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
});

// Saxta Stitch MCP (real Google-a sorğu getmir, kredit xərclənmir): layihə → ekranlar → HTML
export function fakeStitch(overrides: Partial<Record<string, (args: Record<string, any>) => unknown>> = {}): StitchTransport & { calls: { tool: string; args: Record<string, any> }[] } {
  const screens = new Map<string, string[]>();
  let n = 0;
  const calls: { tool: string; args: Record<string, any> }[] = [];
  const screen = (projectId: string, prompt: string) => {
    const id = `scr${++n}`;
    screens.set(projectId, [...(screens.get(projectId) ?? []), id]);
    return { id, name: `projects/${projectId}/screens/${id}`, title: prompt.slice(0, 20), htmlCode: { name: `projects/${projectId}/files/html_${id}` } };
  };
  const fn = (async (tool: string, args: Record<string, any>) => {
    calls.push({ tool, args });
    if (overrides[tool]) return overrides[tool]!(args) as Record<string, any>;
    switch (tool) {
      case 'create_project': return { name: `projects/p${++n}` };
      case 'list_screens': return { screens: (screens.get(args.projectId) ?? []).map((id) => ({ id })) };
      case 'get_screen': { const id = String(args.name).split('/').pop(); return { id, htmlCode: { name: `projects/x/files/html_${id}` } }; }
      case 'generate_screen_from_text':
      case 'edit_screens':
        return { outputComponents: [{ design: { screens: [screen(args.projectId, args.prompt)] } }, { text: `Hazırdır: ${args.prompt}` }, { suggestion: 'Qaranlıq rejim əlavə et' }] };
      case 'download_file':
        return { html: `<html><head><script src="https://cdn.tailwindcss.com"></script><script>alert(1)</script></head><body><h1 onclick="steal()">${String(args.name)}</h1><a href="https://stitch.withgoogle.com">x</a></body></html>` };
      default: throw new Error(`fakeStitch: ${tool}`);
    }
  }) as unknown as StitchTransport & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

export function createTestApp(options: { config?: Partial<Config>; handlers?: Handlers; aiGenerator?: GenerateFn | null; stitchTransport?: StitchTransport | null } = {}) {
  const db: DB = createTestDb(); // şablondan təmiz PostgreSQL DB (sorğular DB hazır olana qədər gözləyir)
  // Saat dəqiqənin əvvəlinə dondurulur → rate limit pəncərəsi test ortasında dəyişmir.
  const start = new Date();
  start.setUTCSeconds(0, 0);
  const clock: TestClock = {
    now: start,
    advance(seconds) {
      this.now = new Date(this.now.getTime() + seconds * 1000);
    },
  };
  const config: Config = {
    ...baseConfig,
    simulate: { enabled: true, slowMs: 20, timeoutMs: 20 },
    infra: { ...baseConfig.infra, consumerDelayMs: 0 }, // Kafka consumer-i dərhal işləsin (gözləmə: infra.kafka.idle())
    ...options.config,
    now: () => clock.now,
  };
  // Hər test app-i HƏMİŞƏ öz müvəqqəti material qovluqları ilə işləyir (options.config.materials verilsə belə):
  // real data/materials və materials/slides qovluqlarına heç vaxt yazılmır.
  config.materials = {
    ...config.materials,
    dir: fs.mkdtempSync(path.join(os.tmpdir(), 'apilab-mat-')),
    slidesDir: fs.mkdtempSync(path.join(os.tmpdir(), 'apilab-slides-')),
  };
  config.webDist = fs.mkdtempSync(path.join(os.tmpdir(), 'apilab-web-')); // portal build-indən asılı olmasın
  for (const dir of [config.materials.dir, config.materials.slidesDir]) {
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()))) throw new Error(`Test material qovluğu tmp-də deyil: ${dir}`);
  }
  // Müəllim (SUPERADMIN) hesabı ilk login('muellim1') zamanı yaradılır — digər testlərin datasına təsir etmir
  config.superadmin = { username: 'muellim1', password: SUPERADMIN_PASSWORD, name: 'Test Müəllim' };
  let superadminReady: Promise<unknown> | undefined;
  const app = createApp({ db, config, handlers: options.handlers, aiGenerator: options.aiGenerator === undefined ? fakeGemini : options.aiGenerator, stitchTransport: options.stitchTransport === undefined ? fakeStitch() : options.stitchTransport, stitchWait: async () => {} });
  const infra = app.locals.infra as import('../server/src/infra/index.js').Infra;
  const auth = new AuthService(db, config);
  const view = testView(db); // testlər DB-ni bu görünüşlə oxuyur (log yazıları tamamlanmış olur)
  const api = () => request(app);

  async function login(username = 'student', password = username === 'muellim1' ? SUPERADMIN_PASSWORD : `${username}123`) {
    if (username === 'muellim1') await (superadminReady ??= ensureSuperadmin(db, config));
    const res = await api().post('/api/v1/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    return res.body as { access_token: string; refresh_token: string; scope: string };
  }

  return { app, db: view, clock, config, auth, api, login, infra };
}

// Contract test: real cavab OpenAPI sxeminə uyğun olmalıdır.
export function expectMatchesSpec(res: request.Response, operationId: string) {
  const op = operations.find((o) => o.operationId === operationId);
  if (!op) throw new Error(`operationId tapılmadı: ${operationId}`);
  const contentType = String(res.headers['content-type'] ?? '').split(';')[0];
  const errors = responseValidator.validate(op, res.status, contentType, res.body);
  expect(errors, `${operationId} ${res.status}: ${errors.join('; ')}`).toEqual([]);
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
