// Express app-ın yığılması. Middleware sırası (vacibdir!):
//   request-id → request_log → helmet/CORS → rate limit (Redis) → X-Simulate
//   → [hər endpoint: auth → scope → body parse → validation → idempotency → handler]
//   → 404 → /docs + portal (statik) → vahid error handler
import express from 'express';
import { config as defaultConfig, type Config } from './config.js';
import type { DB } from './db.js';
import { listOperations, loadOpenApi, type OpenApiDoc } from './openapi/spec.js';
import { mountOperations, type Handlers } from './openapi/router.js';
import { requestId } from './middleware/requestId.js';
import { requestLog } from './middleware/requestLog.js';
import { security } from './middleware/security.js';
import { operationRateLimit, rateLimit } from './middleware/rateLimit.js';
import { simulate } from './middleware/simulate.js';
import { authenticate, requireScopes } from './middleware/auth.js';
import { idempotency } from './middleware/idempotency.js';
import { errorHandler, routeNotFound } from './middleware/errorHandler.js';
import { mountStatic } from './static.js';
import { AuthService } from './modules/auth/service.js';
import { authHandlers } from './modules/auth/routes.js';
import { oauthHandlers } from './modules/oauth/routes.js';
import { metaHandlers } from './modules/meta/routes.js';
import { bankHandlers } from './modules/bank/routes.js';
import { currencyHandlers } from './modules/currency/routes.js';
import { customersHandlers } from './modules/customers/routes.js';
import { flightsHandlers } from './modules/flights/routes.js';
import { hotelsHandlers } from './modules/hotels/routes.js';
import { booksHandlers } from './modules/books/routes.js';
import { musicHandlers } from './modules/music/routes.js';
import { adminHandlers } from './modules/admin/routes.js';
import { bffHandlers } from './modules/bff/routes.js';
import { sqlHandlers } from './modules/sql/routes.js';
import { externalHandlers } from './modules/external/routes.js';
import { pathGuard } from './modules/external/proxy.js';
import { MaterialsService } from './modules/materials/service.js';
import { materialsHandlers } from './modules/materials/routes.js';
import { tasksHandlers } from './modules/tasks/routes.js';
import { uploadParser } from './middleware/upload.js';
import { Infra } from './infra/index.js';
import { infraHandlers } from './modules/infra/routes.js';
import { notificationsHandlers } from './modules/notifications/routes.js';
import { v2BankHandlers } from './modules/v2/bank.js';
import { v2CatalogHandlers } from './modules/v2/catalog.js';
import { aiHandlers, SYSTEM_INSTRUCTION } from './modules/ai/routes.js';
import { GeminiService, type GenerateFn } from './modules/ai/gemini.js';
import { DesignService } from './modules/design/service.js';
import { designHandlers } from './modules/design/routes.js';
import type { StitchTransport } from './modules/design/stitch.js';

export interface AppContext {
  db: DB;
  config: Config;
  spec: OpenApiDoc;
  auth: AuthService;
  materials: MaterialsService;
  infra: Infra; // Redis / Kafka / MongoDB simulyasiyaları
  ai: GeminiService; // Callbox AI (Google Gemini)
  design: DesignService; // Design bölməsi (Google Stitch)
}

const API_PREFIXES = ['/api', '/oauth', '/bff', '/external', '/realms'];

// Runtime parametrlərinə görə spec-in nüsxəsi dəyişdirilir — /api/openapi.json və Swagger da bunu göstərir.
function applyRuntimeOptions(spec: OpenApiDoc, config: Config): OpenApiDoc {
  if (!config.authCustomers) return spec;
  const copy: OpenApiDoc = structuredClone(spec);
  for (const item of Object.values(copy.paths)) {
    for (const [method, op] of Object.entries<any>(item)) {
      if (op?.tags?.includes('Customers') && method !== 'options') op.security = [{ bearerAuth: [] }];
    }
  }
  return copy;
}

// aiGenerator — testlər üçün saxta Gemini (real Google-a sorğu getmir); verilməsə SDK istifadə olunur
export function createApp(options: { db: DB; config?: Partial<Config>; handlers?: Handlers; aiGenerator?: GenerateFn | null; stitchTransport?: StitchTransport | null; stitchWait?: (ms: number) => Promise<void> }) {
  const config: Config = { ...defaultConfig, ...options.config };
  const spec = applyRuntimeOptions(loadOpenApi(), config);
  const ctx: AppContext = {
    db: options.db,
    config,
    spec,
    auth: new AuthService(options.db, config),
    materials: new MaterialsService({ db: options.db, config }),
    infra: new Infra(options.db, config),
    ai: new GeminiService(
      { ...config.ai, systemInstruction: SYSTEM_INSTRUCTION },
      options.aiGenerator !== undefined ? options.aiGenerator : undefined,
    ),
    design: new DesignService(options.db, config, options.stitchTransport, options.stitchWait),
  };

  const handlers: Handlers = {
    ...authHandlers(ctx),
    ...oauthHandlers(ctx),
    ...metaHandlers(ctx),
    ...bankHandlers(ctx),
    ...currencyHandlers(ctx),
    ...customersHandlers(ctx),
    ...flightsHandlers(ctx),
    ...hotelsHandlers(ctx),
    ...booksHandlers(ctx),
    ...musicHandlers(ctx),
    ...adminHandlers(ctx),
    ...bffHandlers(ctx),
    ...sqlHandlers(ctx),
    ...externalHandlers(ctx),
    ...materialsHandlers(ctx, ctx.materials),
    ...tasksHandlers(ctx),
    ...infraHandlers(ctx),
    ...notificationsHandlers(ctx),
    ...v2BankHandlers(ctx),
    ...v2CatalogHandlers(ctx),
    ...aiHandlers(ctx),
    ...designHandlers(ctx),
    ...options.handlers, // testlər üçün əvəzləmə
  };

  const app = express();
  // Spec-də olub handler-i olmayan endpoint-lər (501 qaytarır) — testlər və başlanğıc log-u üçün
  app.locals.materials = ctx.materials; // testlər üçün: konvertasiya növbəsini gözləmək
  app.locals.design = ctx.design; // testlər/başlanğıc üçün: arxa plan generasiyalarını gözləmək, yarımçıq işləri bağlamaq
  app.locals.infra = ctx.infra; // testlər üçün: Kafka consumer-lərini gözləmək (infra.kafka.idle())
  app.locals.unimplemented = listOperations(spec)
    .filter((op) => !handlers[op.operationId] && op.method !== 'options')
    .map((op) => op.operationId);
  // Yalnız TRUSTED_PROXIES-dən gələn X-Forwarded-For nəzərə alınır; digər mənbələrdə req.ip = socket ünvanı
  app.set('trust proxy', config.trustedProxies);
  app.set('json spaces', 2);
  app.set('etag', false); // ETag-ları özümüz idarə edirik (customers) — Express-in avtomatik ETag-ı söndürülür

  app.use(requestId);
  app.use(API_PREFIXES, requestLog(ctx.db, config));
  app.use(security(config));
  app.use(API_PREFIXES, rateLimit(ctx.infra.redis, config, ctx.auth));
  app.use(API_PREFIXES, simulate(config));
  app.use('/external', pathGuard()); // SSRF: xam URL-də .., //, @, \, %2e, %2f, CR/LF → 400 (routing-dən əvvəl)

  mountOperations(app, {
    spec,
    handlers,
    authenticate: (op) => authenticate(op, spec, ctx.auth),
    requireScopes,
    operationRateLimit: operationRateLimit(ctx.infra.redis, config),
    uploadParser: uploadParser(config),
    idempotency: idempotency(ctx.db, config),
  });

  app.use(API_PREFIXES, routeNotFound);
  mountStatic(app, config); // /docs (Swagger UI) + web/dist (portal) və ya başlanğıc səhifəsi
  app.use(errorHandler(config));
  return app;
}
