// Route-lar OpenAPI-dən qeydiyyatdan keçir: spec-də olmayan endpoint mövcud deyil.
// Hər endpoint üçün zəncir: auth → scope → body parse → validation → (idempotency) → handler.
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { ApiError } from '../errors.js';
import { listOperations, resolveRef, type OpenApiDoc, type OperationInfo } from './spec.js';
import { RequestValidator } from './validator.js';

export type Handler = (req: Request, res: Response) => unknown;
export type Handlers = Record<string, Handler>;

export interface RouterDeps {
  spec: OpenApiDoc;
  handlers: Handlers;
  authenticate: (op: OperationInfo) => RequestHandler;
  requireScopes: (op: OperationInfo) => RequestHandler;
  idempotency: RequestHandler;
}

// /api/v1/cards/{cardId} → /api/v1/cards/:cardId
const toExpressPath = (p: string) => p.replace(/\{([^}]+)\}/g, ':$1');

// Literal seqment parametrdən əvvəl: /flights/bookings → /flights/{flightId}-dən əvvəl qeydiyyatdan keçməlidir.
function comparePaths(a: string, b: string): number {
  const sa = a.split('/');
  const sb = b.split('/');
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const pa = sa[i].startsWith('{');
    const pb = sb[i].startsWith('{');
    if (pa !== pb) return pa ? 1 : -1;
  }
  return sb.length - sa.length;
}

const METHOD_ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const bodyParsers = [express.json({ limit: '100kb' }), express.urlencoded({ extended: false, limit: '100kb' })];

// Spec-də yazılmış OPTIONS əməliyyatı — Allow başlığı validation addımında təyin olunur.
const optionsDefault: Handler = (_req, res) => {
  res.status(204).end();
};

const notImplemented: Handler = (req) => {
  throw new ApiError(501, 'NOT_IMPLEMENTED', `Bu endpoint hələ implementasiya olunmayıb: ${req.operation?.operationId}`);
};

export function mountOperations(app: Express, deps: RouterDeps): void {
  const validator = new RequestValidator(deps.spec);
  const ops = listOperations(deps.spec);
  const paths = [...new Set(ops.map((o) => o.path))].sort(comparePaths);

  for (const path of paths) {
    const pathOps = ops.filter((o) => o.path === path);
    const allowed = pathOps.map((o) => o.method.toUpperCase());
    if (allowed.includes('GET') && !allowed.includes('HEAD')) allowed.push('HEAD');
    if (!allowed.includes('OPTIONS')) allowed.push('OPTIONS');
    const allowHeader = METHOD_ORDER.filter((m) => allowed.includes(m)).join(', ');
    const route = app.route(toExpressPath(path));

    for (const op of pathOps) {
      const hasIdempotencyKey = (op.operation.parameters ?? []).some(
        (p: unknown) => resolveRef(deps.spec, p)?.name === 'Idempotency-Key',
      );
      const handler = deps.handlers[op.operationId] ?? (op.method === 'options' ? optionsDefault : notImplemented);
      const chain: RequestHandler[] = [
        (req, _res, next) => {
          req.operation = op;
          next();
        },
        deps.authenticate(op),
        deps.requireScopes(op),
        ...bodyParsers,
        (req, res, next) => {
          req.valid = validator.validate(op, req);
          if (op.method === 'options') res.set('Allow', allowHeader);
          next();
        },
        ...(hasIdempotencyKey ? [deps.idempotency] : []),
        async (req, res) => {
          await handler(req, res);
        },
      ];
      route[op.method](...chain);
    }

    // OPTIONS — spec-də yazılmayıbsa da standart cavab (Allow başlığı)
    if (!pathOps.some((o) => o.method === 'options')) {
      route.options((_req, res) => {
        res.set('Allow', allowHeader).status(204).end();
      });
    }
    // Path var, metod yoxdur → 405 Method Not Allowed
    route.all((req) => {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} bu endpoint üçün dəstəklənmir`, [], { Allow: allowHeader });
    });
  }
}
