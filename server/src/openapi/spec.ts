// OpenAPI sənədinin yüklənməsi — "single source of truth".
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ROOT_DIR } from '../config.js';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

// Tipləri sadə saxlayırıq: sənəd JSON obyektidir, lazım olan sahələrə birbaşa müraciət edirik.
export type OpenApiDoc = { openapi: string; info: Record<string, unknown>; paths: Record<string, Record<string, any>>; components: Record<string, any> };

export interface OperationInfo {
  method: HttpMethod;
  path: string;
  operationId: string;
  tag: string;
  summary: string;
  operation: Record<string, any>;
}

export function loadOpenApiFromYaml(file = path.join(ROOT_DIR, 'openapi', 'openapi.yaml')): OpenApiDoc {
  return YAML.parse(fs.readFileSync(file, 'utf8')) as OpenApiDoc;
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
