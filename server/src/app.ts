// Express app-ın yığılması. Middleware sırası (vacibdir!):
//   request-id → request_log → helmet/CORS → rate limit → X-Simulate
//   → [hər endpoint: auth → scope → body parse → validation → idempotency → handler]
//   → 404 → vahid error handler
import express from 'express';
import { config as defaultConfig, type Config } from './config.js';
import type { DB } from './db.js';
import { loadOpenApi, type OpenApiDoc } from './openapi/spec.js';
import { mountOperations, type Handlers } from './openapi/router.js';
import { requestId } from './middleware/requestId.js';
import { requestLog } from './middleware/requestLog.js';
import { security } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';
import { simulate } from './middleware/simulate.js';
import { authenticate, requireScopes } from './middleware/auth.js';
import { idempotency } from './middleware/idempotency.js';
import { errorHandler, routeNotFound } from './middleware/errorHandler.js';
import { AuthService } from './modules/auth/service.js';
import { authHandlers } from './modules/auth/routes.js';
import { oauthHandlers } from './modules/oauth/routes.js';
import { metaHandlers } from './modules/meta/routes.js';
import { bankHandlers } from './modules/bank/routes.js';
import { currencyHandlers } from './modules/currency/routes.js';

export interface AppContext {
  db: DB;
  config: Config;
  spec: OpenApiDoc;
  auth: AuthService;
}

const API_PREFIXES = ['/api', '/oauth', '/bff'];

export function createApp(options: { db: DB; config?: Partial<Config>; handlers?: Handlers }) {
  const config: Config = { ...defaultConfig, ...options.config };
  const spec = loadOpenApi();
  const ctx: AppContext = { db: options.db, config, spec, auth: new AuthService(options.db, config) };

  const handlers: Handlers = {
    ...authHandlers(ctx),
    ...oauthHandlers(ctx),
    ...metaHandlers(ctx),
    ...bankHandlers(ctx),
    ...currencyHandlers(ctx),
    ...options.handlers, // testlər üçün əvəzləmə
  };

  const app = express();
  app.set('trust proxy', 'loopback');
  app.set('json spaces', 2);

  app.use(requestId);
  app.use(API_PREFIXES, requestLog(ctx.db, config));
  app.use(security());
  app.use(API_PREFIXES, rateLimit(ctx.db, config, ctx.auth));
  app.use(API_PREFIXES, simulate(config));

  mountOperations(app, {
    spec,
    handlers,
    authenticate: (op) => authenticate(op, spec, ctx.auth),
    requireScopes,
    idempotency: idempotency(ctx.db, config),
  });

  app.use(API_PREFIXES, routeNotFound);
  app.use(errorHandler(config));
  return app;
}
