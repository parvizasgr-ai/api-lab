// Request validation — OpenAPI sxemindən (ajv). "Strict JSON Schema validation" nümunəsi.
//   * Sxemə uyğun olmayan hər şey (bilinməyən sahə, tip, enum, pattern, required) → 422.
//   * Sxemdə `x-error-code` varsa, həmin sahənin xətası o kodla qaytarılır (məs. INVALID_REASON).
//   * Endpoint-də `x-error-format: oauth2` varsa → RFC 6749 formatı (400 invalid_request).
//   * Dəstəklənməyən Content-Type → 415, dəstəklənməyən Accept → 406.
import type { Request } from 'express';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { ApiError, OAuthError, type ErrorDetail } from '../errors.js';
import type { ValidatedRequest } from '../types.js';
import { resolveRef, type OpenApiDoc, type OperationInfo } from './spec.js';

// ajv-formats CommonJS paketidir — ESM-də default export belə alınır.
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (ajv: Ajv) => Ajv;
type AjvInstance = Ajv;

const SCHEMA_BASE = 'https://apilab.local/schemas/';

// '#/components/schemas/X' → 'https://apilab.local/schemas/X' (ajv-də hər komponent ayrıca schema kimi qeydiyyatdadır)
function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) return node.map(rewriteRefs) as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === '$ref' && typeof v === 'string' ? v.replace('#/components/schemas/', SCHEMA_BASE) : rewriteRefs(v);
    }
    return out as T;
  }
  return node;
}

export function createAjv(spec: OpenApiDoc, options: Record<string, unknown> = {}): AjvInstance {
  const ajv: AjvInstance = new Ajv({ allErrors: true, verbose: true, strict: true, multipleOfPrecision: 6, ...options });
  addFormats(ajv);
  ajv.addFormat('password', true);
  // OpenAPI-nin JSON Schema-dan kənar açar sözləri — validasiyaya təsir etmir.
  for (const keyword of ['example', 'xml', 'x-error-code']) ajv.addKeyword({ keyword });
  for (const [name, schema] of Object.entries(spec.components.schemas ?? {})) {
    ajv.addSchema(rewriteRefs(schema) as object, SCHEMA_BASE + name);
  }
  return ajv;
}

type Location = 'path' | 'query' | 'header' | 'body';

interface CompiledOperation {
  params: Partial<Record<Exclude<Location, 'body'>, ValidateFunction>>;
  body?: { required: boolean; contentTypes: string[]; validators: Record<string, ValidateFunction> };
  responseTypes: string[];
  oauthErrors: boolean;
}

const VALIDATION_MESSAGE = 'Sorğu sxemə uyğun deyil';

function toDetails(errors: ErrorObject[], location: Location): { details: ErrorDetail[]; code?: string } {
  const details: ErrorDetail[] = [];
  let code: string | undefined;
  for (const e of errors) {
    let name: string | undefined;
    let ownSchema: any = e.parentSchema;
    if (e.keyword === 'required') {
      name = (e.params as { missingProperty: string }).missingProperty;
      ownSchema = (e.parentSchema as any)?.properties?.[name];
    } else if (e.keyword === 'additionalProperties') {
      name = (e.params as { additionalProperty: string }).additionalProperty;
    }
    let field: string;
    if (location === 'body') field = name !== undefined ? `${e.instancePath}/${name}` : e.instancePath || 'body';
    else field = `${location} ${name ?? e.instancePath.split('/')[1] ?? ''}`.trim();

    let message = e.message ?? 'invalid';
    if (e.keyword === 'enum') message += ': ' + (e.params as { allowedValues: unknown[] }).allowedValues.join(', ');
    if (e.keyword === 'additionalProperties' && location === 'query') message = 'naməlum query parametri';
    details.push({ field, message });
    code ??= ownSchema?.['x-error-code'];
  }
  return { details, code };
}

function paramsSchema(spec: OpenApiDoc, params: any[], location: Exclude<Location, 'body'>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const raw of params) {
    const p = resolveRef(spec, raw);
    if (p.in !== location) continue;
    const name = location === 'header' ? p.name.toLowerCase() : p.name;
    properties[name] = rewriteRefs(p.schema ?? {});
    if (p.required) required.push(name);
  }
  if (!Object.keys(properties).length && location !== 'query') return undefined;
  return {
    type: 'object',
    properties,
    required,
    // Query-də bilinməyən parametr də xətadır (məs. ?pgae=2 yazı səhvi). Header-lərdə isə yox — brauzer/Postman çox başlıq göndərir.
    additionalProperties: location !== 'query',
  };
}

export class RequestValidator {
  private paramAjv: AjvInstance;
  private bodyAjv: AjvInstance;
  private compiled = new Map<string, CompiledOperation>();

  constructor(private spec: OpenApiDoc) {
    // Path/query/header dəyərləri həmişə string gəlir → tipə çevrilir (coerceTypes). Body-də isə çevirmə YOXDUR: "5" ≠ 5.
    this.paramAjv = createAjv(spec, { coerceTypes: true, useDefaults: true });
    this.bodyAjv = createAjv(spec, { useDefaults: true });
  }

  private compile(op: OperationInfo): CompiledOperation {
    const cached = this.compiled.get(op.operationId);
    if (cached) return cached;
    const pathItem = this.spec.paths[op.path];
    const params = [...(pathItem.parameters ?? []), ...(op.operation.parameters ?? [])];
    const result: CompiledOperation = {
      params: {},
      responseTypes: [],
      oauthErrors: op.operation['x-error-format'] === 'oauth2',
    };
    for (const loc of ['path', 'query', 'header'] as const) {
      const schema = paramsSchema(this.spec, params, loc);
      if (schema) result.params[loc] = this.paramAjv.compile(schema);
    }
    const rb = resolveRef(this.spec, op.operation.requestBody);
    if (rb) {
      const validators: Record<string, ValidateFunction> = {};
      for (const [type, media] of Object.entries<any>(rb.content)) {
        validators[type] = this.bodyAjv.compile(rewriteRefs(media.schema));
      }
      result.body = { required: !!rb.required, contentTypes: Object.keys(rb.content), validators };
    }
    for (const [status, raw] of Object.entries<any>(op.operation.responses ?? {})) {
      const r = resolveRef(this.spec, raw);
      if (status.startsWith('2') && r.content) result.responseTypes.push(...Object.keys(r.content));
    }
    this.compiled.set(op.operationId, result);
    return result;
  }

  private fail(compiled: CompiledOperation, details: ErrorDetail[], code?: string): never {
    if (compiled.oauthErrors) {
      const grantType = details.some((d) => d.field.endsWith('grant_type') && d.message.includes('allowed values'));
      throw new OAuthError(
        400,
        grantType ? 'unsupported_grant_type' : 'invalid_request',
        details.map((d) => `${d.field}: ${d.message}`).join('; '),
      );
    }
    throw new ApiError(422, code ?? 'VALIDATION_ERROR', VALIDATION_MESSAGE, details);
  }

  validate(op: OperationInfo, req: Request): ValidatedRequest {
    const compiled = this.compile(op);

    // 406 — client-in istədiyi formatı qaytara bilmirik
    if (compiled.responseTypes.length && req.headers.accept && !req.accepts(compiled.responseTypes)) {
      throw new ApiError(406, 'NOT_ACCEPTABLE', `Dəstəklənən formatlar: ${[...new Set(compiled.responseTypes)].join(', ')}`);
    }

    const valid: ValidatedRequest = { params: { ...req.params }, query: { ...(req.query as object) }, headers: {}, body: undefined };
    const sources = { path: valid.params, query: valid.query, header: valid.headers };
    for (const [name, value] of Object.entries(req.headers)) valid.headers[name] = value;

    const details: ErrorDetail[] = [];
    let code: string | undefined;
    for (const loc of ['path', 'query', 'header'] as const) {
      const fn = compiled.params[loc];
      if (fn && !fn(sources[loc])) {
        const r = toDetails(fn.errors ?? [], loc);
        details.push(...r.details);
        code ??= r.code;
      }
    }

    if (compiled.body) {
      const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
      const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (hasBody && !compiled.body.contentTypes.includes(contentType)) {
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', `Content-Type ${compiled.body.contentTypes.join(' və ya ')} olmalıdır`, [
          { field: 'Content-Type', message: `Alındı: ${contentType || '(yoxdur)'}` },
        ]);
      }
      if (req.body === undefined) {
        if (compiled.body.required) details.push({ field: 'body', message: 'Request body məcburidir' });
      } else {
        const fn = compiled.body.validators[contentType] ?? Object.values(compiled.body.validators)[0];
        valid.body = req.body;
        if (!fn(valid.body)) {
          const r = toDetails(fn.errors ?? [], 'body');
          details.push(...r.details);
          code ??= r.code;
        }
      }
    }

    if (details.length) this.fail(compiled, details, code);
    return valid;
  }
}

// ---- Contract test köməkçisi: cavab sxemə uyğundurmu? (testlərdə istifadə olunur)
export class ResponseValidator {
  private ajv: AjvInstance;
  private cache = new Map<string, ValidateFunction | null>();
  constructor(private spec: OpenApiDoc) {
    this.ajv = createAjv(spec);
  }

  validate(op: OperationInfo, status: number, contentType: string, body: unknown): string[] {
    const key = `${op.operationId}:${status}:${contentType}`;
    if (!this.cache.has(key)) {
      const response = resolveRef(this.spec, op.operation.responses?.[String(status)]);
      if (!response) {
        this.cache.set(key, undefined as any);
      } else {
        const schema = response.content?.[contentType]?.schema;
        this.cache.set(key, schema ? this.ajv.compile(rewriteRefs(schema)) : null);
      }
    }
    const fn = this.cache.get(key);
    if (fn === undefined) return [`${op.operationId}: ${status} status kodu spec-də sənədləşdirilməyib`];
    if (fn === null) return [];
    return fn(body) ? [] : (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  }
}
