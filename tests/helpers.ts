// Test köməkçiləri: hər test faylı öz in-memory DB-si və "dondurulmuş" saatı ilə app yaradır.
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../server/src/app.js';
import { config as baseConfig, type Config } from '../server/src/config.js';
import { openDb, resetDatabase, type DB } from '../server/src/db.js';
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
  const db: DB = openDb(':memory:');
  resetDatabase(db);
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
  const app = createApp({ db, config, handlers: options.handlers });
  const auth = new AuthService(db, config);
  const api = () => request(app);

  async function login(username = 'student', password = `${username}123`) {
    const res = await api().post('/api/v1/auth/login').send({ username, password });
    expect(res.status).toBe(200);
    return res.body as { access_token: string; refresh_token: string; scope: string };
  }

  return { app, db, clock, config, auth, api, login };
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
