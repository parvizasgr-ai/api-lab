// OpenAPI sənədinin struktur testləri (lint — npm run openapi:lint; contract testlər — (c)/(h) mərhələsində).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT_DIR } from '../server/src/config.js';
import { loadOpenApiFromYaml, listOperations } from '../server/src/openapi/spec.js';

const spec = loadOpenApiFromYaml();
const ops = listOperations(spec);

describe('openapi.yaml', () => {
  it('OpenAPI 3.0.3', () => {
    expect(spec.openapi).toBe('3.0.3');
  });

  it('openapi.json yaml ilə sinxrondur (npm run openapi:bundle)', () => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'openapi', 'openapi.json'), 'utf8'));
    expect(json).toEqual(spec);
  });

  it('operationId-lər unikaldır', () => {
    const ids = ops.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bütün tələb olunan modullar əhatə olunub', () => {
    const tags = new Set(ops.map((o) => o.tag));
    for (const t of ['Auth', 'OAuth2', 'Accounts', 'Cards', 'Transfers', 'Currencies', 'Flights', 'Hotels', 'Customers', 'Books', 'Music', 'BFF', 'SQL Playground', 'Admin', 'Meta']) {
      expect(tags).toContain(t);
    }
  });

  it('x-required-scopes olan endpoint-lər Bearer tələb edir', () => {
    for (const o of ops.filter((x) => x.operation['x-required-scopes'])) {
      const schemes = (o.operation.security ?? []).flatMap((s: object) => Object.keys(s));
      expect(schemes, o.operationId).toContain('bearerAuth');
    }
  });

  it('cards block: reason enum, Idempotency-Key və bütün status kodları', () => {
    const op = spec.paths['/api/v1/cards/{cardId}/block'].post;
    expect(Object.keys(op.responses).sort()).toEqual(expect.arrayContaining(['200', '401', '403', '404', '409', '422', '429']));
    const reason = spec.components.schemas.BlockCardRequest.properties.reason;
    expect(reason.enum).toEqual(['LOST', 'STOLEN', 'SUSPECTED_FRAUD']);
    expect(reason['x-error-code']).toBe('INVALID_REASON');
    expect(op.parameters.map((p: { $ref: string }) => p.$ref)).toContain('#/components/parameters/IdempotencyKeyOptional');
  });

  it('nümunələrdəki xəta kodları ErrorCode enum-unda var', () => {
    const codes = new Set<string>(spec.components.schemas.ErrorCode.enum);
    const text = fs.readFileSync(path.join(ROOT_DIR, 'openapi', 'openapi.yaml'), 'utf8');
    const used = [...text.matchAll(/status: \d{3}, code: ([A-Z_]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(50);
    for (const c of used) expect(codes, c).toContain(c);
  });
});

describe('postman/ faylları', () => {
  it('spec ilə sinxrondur (npm run postman:export)', async () => {
    const { buildCollection } = await import('../server/src/postman/collection.js');
    const file = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'postman', 'api-lab.postman_collection.json'), 'utf8'));
    expect(file).toEqual(buildCollection(spec));
  });
});

describe('nümunə tarixləri köhnəlmir', () => {
  // Request nümunələrindəki tarixlər (bron, axtarış) keçmişə düşəndə Swagger "Try it out" 422 verir. Server bu gündən
  // əvvəlki checkIn-i rədd edir — ona görə nümunələr ən azı 180 gün irəlidə olmalıdır (köhnəlmə yarım il əvvəl görünür).
  it('query/body nümunələrində date/checkIn/checkOut ≥ bu gün + 180 gün', () => {
    const minDate = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
    const keys = new Set(['date', 'checkIn', 'checkOut']);
    const found: string[] = [];
    const scan = (where: string, value: unknown) => {
      if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
        if (keys.has(k) && typeof v === 'string') found.push(`${where}.${k}=${v}`);
        else scan(where, v);
      }
    };
    for (const o of ops) {
      for (const p of (o.operation.parameters ?? []).map((x: any) => (x.$ref ? spec.components.parameters[x.$ref.split('/').pop()] : x))) {
        // v2GetExchangeRates.date — tarixi məzənnə: nümunə mütləq keçmişdədir (gələcək tarix → 422)
        if (p.in === 'query' && keys.has(p.name) && p.example && o.operationId !== 'v2GetExchangeRates') found.push(`${o.operationId}.${p.name}=${p.example}`);
      }
      const media = o.operation.requestBody?.content?.['application/json'];
      if (media) scan(o.operationId, { example: media.example, examples: media.examples });
    }
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((f) => f.split('=')[1] < minDate)).toEqual([]);
  });
});
