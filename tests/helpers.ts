// Test köməkçiləri: hər test app-i öz təmiz PostgreSQL DB-si (şablondan) və "dondurulmuş" saatı ilə yaranır.
import fs from 'node:fs';
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

export function createTestApp(options: { config?: Partial<Config>; handlers?: Handlers } = {}) {
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
  const app = createApp({ db, config, handlers: options.handlers });
  const auth = new AuthService(db, config);
  const view = testView(db); // testlər DB-ni bu görünüşlə oxuyur (log yazıları tamamlanmış olur)
  const api = () => request(app);

  async function login(username = 'student', password = username === 'muellim1' ? SUPERADMIN_PASSWORD : `${username}123`) {
    if (username === 'muellim1') await (superadminReady ??= ensureSuperadmin(db, config));
    const res = await api().post('/api/v1/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    return res.body as { access_token: string; refresh_token: string; scope: string };
  }

  return { app, db: view, clock, config, auth, api, login };
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
