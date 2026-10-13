// OpenAPI sənədinin yüklənməsi — "single source of truth".
// Server openapi/openapi.json-u oxuyur (npm run openapi:bundle YAML-dan yaradır).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT_DIR, config } from '../config.js';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

// Tipləri sadə saxlayırıq: sənəd JSON obyektidir, lazım olan sahələrə birbaşa müraciət edirik.
export type OpenApiDoc = {
  openapi: string;
  info: Record<string, unknown>;
  paths: Record<string, Record<string, any>>;
  components: Record<string, any>;
};

export interface OperationInfo {
  method: HttpMethod;
  path: string; // OpenAPI şablonu: /api/v1/cards/{cardId}
  operationId: string;
  tag: string;
  summary: string;
  operation: Record<string, any>;
}

export function loadOpenApiFromYaml(file = path.join(ROOT_DIR, 'openapi', 'openapi.yaml')): OpenApiDoc {
  return YAML.parse(fs.readFileSync(file, 'utf8')) as OpenApiDoc;
}

export function loadOpenApi(file = config.openapiJson): OpenApiDoc {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as OpenApiDoc;
}

export function listOperations(spec: OpenApiDoc): OperationInfo[] {
  const ops: OperationInfo[] = [];
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      ops.push({ method, path: p, operationId: op.operationId, tag: op.tags?.[0], summary: op.summary, operation: op });
    }
  }
  return ops;
}

// '#/components/parameters/CardId' → obyektin özü
export function resolveRef<T = any>(spec: OpenApiDoc, node: any): T {
  if (!node?.$ref) return node;
  const parts = String(node.$ref).replace(/^#\//, '').split('/');
  let cur: any = spec;
  for (const p of parts) cur = cur[p];
  return resolveRef(spec, cur);
}
