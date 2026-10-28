// OpenAPI → Postman Collection v2.1 (+ environment). Postman collection spec-dən yaranır (single source of truth).
//   * Tag-lar → qovluqlar, {param} → :param (path variable), nümunə body/query dəyərləri spec-dən.
//   * Login və refresh sorğularının "Tests" script-i token-i environment-ə yazır → qalan sorğular {{token}} istifadə edir.
import { listOperations, resolveRef, type OpenApiDoc } from '../openapi/spec.js';

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const TOKEN_SCRIPT = [
  "pm.test('Status 200', () => pm.response.to.have.status(200));",
  'const body = pm.response.json();',
  "pm.environment.set('token', body.access_token);",
  "pm.environment.set('refreshToken', body.refresh_token);",
  "console.log('token environment-ə yazıldı');",
];

function authFor(op: Record<string, any>) {
  const security: Record<string, string[]>[] | undefined = op.security;
  if (!security?.length || security.every((s) => !Object.keys(s).length)) return { type: 'noauth' };
  const scheme = Object.keys(security.find((s) => Object.keys(s).length)!)[0];
  if (scheme === 'apiKeyAuth') {
    return { type: 'apikey', apikey: [{ key: 'key', value: 'X-API-Key' }, { key: 'value', value: '{{apiKey}}' }, { key: 'in', value: 'header' }] };
  }
  if (scheme === 'basicAuth') return { type: 'basic', basic: [{ key: 'username', value: 'student' }, { key: 'password', value: 'student123' }] };
  return { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] };
}

function exampleOf(media: any): unknown {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const first = Object.values<any>(media.examples ?? {})[0];
  return first?.value;
}

export function buildCollection(spec: OpenApiDoc) {
  const folders = new Map<string, any[]>();
  for (const op of listOperations(spec)) {
    const o = op.operation;
    const params = (o.parameters ?? []).map((p: unknown) => resolveRef(spec, p));
    const pathVars = params.filter((p: any) => p.in === 'path').map((p: any) => ({ key: p.name, value: String(p.example ?? p.schema?.example ?? '1') }));
    const query = params
      .filter((p: any) => p.in === 'query')
      .map((p: any) => ({ key: p.name, value: p.example !== undefined ? String(p.example) : '', disabled: !p.required && p.example === undefined }));
    const header = params
      .filter((p: any) => p.in === 'header')
      .map((p: any) => {
        // RapidAPI açarı environment dəyişənindən (tələbə öz açarını yazır) — nümunə dəyər kolleksiyaya düşmür
        if (p.name === 'X-RapidAPI-Key') return { key: p.name, value: '{{rapidApiKey}}', disabled: false };
        return { key: p.name, value: p.name === 'Idempotency-Key' ? '{{$guid}}' : String(p.example ?? ''), disabled: !p.required && p.name !== 'Idempotency-Key' };
      });

    const rb = resolveRef(spec, o.requestBody);
    let body: any;
    if (rb?.content?.['application/json']) {
      header.push({ key: 'Content-Type', value: 'application/json', disabled: false });
      body = { mode: 'raw', raw: JSON.stringify(exampleOf(rb.content['application/json']) ?? {}, null, 2), options: { raw: { language: 'json' } } };
    } else if (rb?.content?.['multipart/form-data']) {
      const ex = (exampleOf(rb.content['multipart/form-data']) ?? {}) as Record<string, unknown>;
      body = {
        mode: 'formdata',
        formdata: Object.entries(ex).map(([key, value]) => (key === 'file' ? { key, type: 'file', src: [] } : { key, type: 'text', value: String(value) })),
      };
    } else if (rb?.content?.['application/x-www-form-urlencoded']) {
      const ex = (exampleOf(rb.content['application/x-www-form-urlencoded']) ?? {}) as Record<string, string>;
      body = { mode: 'urlencoded', urlencoded: Object.entries(ex).map(([key, value]) => ({ key, value: String(value) })) };
    }

    const rawPath = op.path.replace(/\{([^}]+)\}/g, ':$1');
    const item: any = {
      name: `${op.method.toUpperCase()} ${op.path} — ${op.summary}`,
      request: {
        method: op.method.toUpperCase(),
        auth: authFor(o),
        header,
        url: {
          raw: `{{baseUrl}}${rawPath}${query.some((q: any) => !q.disabled) ? '?' + query.filter((q: any) => !q.disabled).map((q: any) => `${q.key}=${q.value}`).join('&') : ''}`,
          host: ['{{baseUrl}}'],
          path: rawPath.split('/').filter(Boolean),
          query,
          variable: pathVars,
        },
        description: o.description ?? o.summary,
        ...(body ? { body } : {}),
      },
    };
    if (op.operationId === 'authLogin' || op.operationId === 'authRefresh') {
      item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: TOKEN_SCRIPT } }];
    }
    if (op.operationId === 'authRefresh' || op.operationId === 'authLogout') {
      item.request.body.raw = JSON.stringify({ refresh_token: '{{refreshToken}}' }, null, 2);
    }
    if (!folders.has(op.tag)) folders.set(op.tag, []);
    folders.get(op.tag)!.push(item);
  }

  return {
    info: {
      name: `${spec.info.title} ${spec.info.version}`,
      description: 'OpenAPI-dən avtomatik yaradılıb. Əvvəlcə "Auth → login" sorğusunu göndərin — token environment-ə yazılacaq.',
      schema: SCHEMA,
    },
    item: [...folders].map(([name, items]) => ({ name, item: items })),
    variable: [{ key: 'baseUrl', value: 'http://localhost:3000' }],
  };
}

export function buildEnvironment(baseUrl: string) {
  return {
    name: 'Callbox — Local',
    values: [
      { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
      { key: 'token', value: '', type: 'secret', enabled: true },
      { key: 'refreshToken', value: '', type: 'secret', enabled: true },
      { key: 'apiKey', value: 'apilab-demo-key-2026', type: 'secret', enabled: true },
      { key: 'rapidApiKey', value: '', type: 'secret', enabled: true }, // External APIs: öz RapidAPI açarınız (rapidapi.com → Apps → Authorization)
    ],
    _postman_variable_scope: 'environment',
  };
}
