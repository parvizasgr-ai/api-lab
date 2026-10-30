// API Reference (developer portal) və Callbox GUI üçün OpenAPI modeli: endpoint-lər, parametrlər, body atributları,
// cavab nümunələri, kod nümunələri (cURL / JavaScript / Python) və API token yaddaşı (token endpoint-indən alınan).
import { getSpec } from "./api";
import { SERVER_URL } from "./http";

type Json = Record<string, any>; // OpenAPI sənədi sərbəst JSON-dur

export const TOKEN_PATH = "/realms/callbox/protocol/openid-connect/token";
export const PUBLIC_CLIENT_ID = "callbox-api";

export type AuthKind = "bearer" | "apiKey" | "basic" | "none";

export type RefParam = {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  type: string;
  description: string;
  example?: unknown;
  enum?: unknown[];
  default?: unknown;
};

export type RefAttribute = {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  description: string;
  enum?: unknown[];
  default?: unknown;
  constraints: string[];
  children: RefAttribute[];
};

export type RefResponse = { status: string; description: string; examples: { name: string; summary: string; value: unknown }[] };

export type RefOperation = {
  id: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  description: string;
  auth: AuthKind;
  scopes: string[];
  params: RefParam[];
  contentType: string | null;
  bodyAttributes: RefAttribute[];
  bodyExamples: { name: string; summary: string; value: unknown }[];
  responses: RefResponse[];
  errorCodes: { status: string; code: string; message: string }[];
  responseAttributes: RefAttribute[];
};

export type RefTag = { name: string; description: string; operations: RefOperation[] };
export type RefModel = { title: string; version: string; groups: { name: string; tags: RefTag[] }[] };

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function resolve(spec: Json, node: unknown): Json {
  let current = node as Json | undefined;
  for (let i = 0; current?.$ref && i < 10; i++) {
    current = (current.$ref as string)
      .replace(/^#\//, "")
      .split("/")
      .reduce<Json | undefined>((acc, key) => acc?.[key], spec);
  }
  return current ?? {};
}

// allOf → bir obyektə birləşdirilir (properties + required)
function flatten(spec: Json, schemaNode: unknown): Json {
  const schema = resolve(spec, schemaNode);
  if (!schema.allOf) return schema;
  const merged: Json = { type: "object", properties: {}, required: [] as string[] };
  for (const part of schema.allOf as unknown[]) {
    const p = flatten(spec, part);
    Object.assign(merged.properties, p.properties ?? {});
    merged.required.push(...(p.required ?? []));
    if (p.description && !merged.description) merged.description = p.description;
  }
  return merged;
}

function typeOf(spec: Json, schemaNode: unknown): string {
  const s = flatten(spec, schemaNode);
  if (s.type === "array") return `array of ${typeOf(spec, s.items)}s`;
  if (s.type === "string" && s.format) return `string (${s.format})`;
  if (s.type === "object" && s.additionalProperties && typeof s.additionalProperties === "object") return "map";
  return String(s.type ?? "object");
}

function constraints(s: Json): string[] {
  const out: string[] = [];
  if (s.minimum !== undefined) out.push(`min ${s.minimum}`);
  if (s.maximum !== undefined) out.push(`max ${s.maximum}`);
  if (s.minLength !== undefined) out.push(`minLength ${s.minLength}`);
  if (s.maxLength !== undefined) out.push(`maxLength ${s.maxLength}`);
  if (s.minItems !== undefined) out.push(`minItems ${s.minItems}`);
  if (s.maxItems !== undefined) out.push(`maxItems ${s.maxItems}`);
  if (s.pattern) out.push(`pattern ${s.pattern}`);
  return out;
}

function attributes(spec: Json, schemaNode: unknown, depth = 0): RefAttribute[] {
  if (depth > 4) return [];
  const s = flatten(spec, schemaNode);
  const props: Json = s.properties ?? {};
  const required = new Set<string>(s.required ?? []);
  return Object.entries(props).map(([name, raw]) => {
    const p = flatten(spec, raw);
    const childSchema = p.type === "array" ? flatten(spec, p.items) : p;
    return {
      name,
      type: typeOf(spec, raw),
      required: required.has(name),
      nullable: !!p.nullable,
      description: String(p.description ?? ""),
      enum: p.enum?.filter((v: unknown) => v !== null),
      default: p.default,
      constraints: constraints(p),
      children: childSchema.properties ? attributes(spec, childSchema, depth + 1) : [],
    };
  });
}

function examplesOf(spec: Json, media: Json | undefined): { name: string; summary: string; value: unknown }[] {
  if (!media) return [];
  if (media.example !== undefined) return [{ name: "example", summary: "", value: media.example }];
  return Object.entries<Json>(media.examples ?? {}).map(([name, ex]) => {
    const e = resolve(spec, ex);
    return { name, summary: String(e.summary ?? name), value: e.value };
  });
}

function authOf(op: Json): AuthKind {
  const schemes = ((op.security ?? []) as Json[]).flatMap((s) => Object.keys(s));
  if (schemes.includes("bearerAuth") || schemes.includes("googleOAuth")) return "bearer";
  if (schemes.includes("apiKeyAuth")) return "apiKey";
  if (schemes.includes("basicAuth")) return "basic";
  return "none";
}

export function buildOperation(spec: Json, path: string, method: string, op: Json): RefOperation {
  const params: RefParam[] = [...(spec.paths[path].parameters ?? []), ...(op.parameters ?? [])].map((raw: unknown) => {
    const p = resolve(spec, raw);
    const schema = resolve(spec, p.schema);
    return {
      name: p.name,
      in: p.in,
      required: !!p.required,
      type: typeOf(spec, p.schema),
      description: String(p.description ?? ""),
      example: p.example ?? schema.example,
      enum: schema.enum,
      default: schema.default,
    };
  });
  const body = resolve(spec, op.requestBody);
  const [contentType, media] = Object.entries<Json>(body.content ?? {})[0] ?? [null, undefined];
  const responses: RefResponse[] = Object.entries<Json>(op.responses ?? {}).map(([status, raw]) => {
    const r = resolve(spec, raw);
    return { status, description: String(r.description ?? ""), examples: examplesOf(spec, r.content?.["application/json"]) };
  });
  const errorCodes = responses
    // 429 / 500 bütün endpoint-lərdə eynidir — "Xətalar" bölməsində bir dəfə izah olunur
    .filter((r) => Number(r.status) >= 400 && r.status !== "429" && r.status !== "500")
    .flatMap((r) =>
      r.examples.map((e) => {
        const v = (e.value ?? {}) as Json;
        return { status: r.status, code: String(v.code ?? v.error ?? ""), message: String(v.message ?? v.error_description ?? r.description) };
      }),
    )
    .filter((e, i, all) => e.code && all.findIndex((x) => x.status === e.status && x.code === e.code) === i);
  const success = Object.entries<Json>(op.responses ?? {}).find(([s]) => s.startsWith("2"));
  const successSchema = success ? resolve(spec, success[1]).content?.["application/json"]?.schema : undefined;
  return {
    id: op.operationId,
    method: method.toUpperCase(),
    path,
    tag: op.tags?.[0] ?? "Other",
    summary: op.summary ?? "",
    description: op.description ?? "",
    auth: authOf(op),
    scopes: op["x-required-scopes"] ?? [],
    params,
    contentType,
    bodyAttributes: media ? attributes(spec, media.schema) : [],
    bodyExamples: examplesOf(spec, media),
    responses,
    errorCodes,
    responseAttributes: successSchema ? attributes(spec, flatten(spec, successSchema).properties?.data?.items ?? successSchema) : [],
  };
}

let modelPromise: Promise<RefModel> | null = null;
export function getReferenceModel(): Promise<RefModel> {
  modelPromise ??= getSpec()
    .then((raw) => {
      const spec = raw as unknown as Json;
      const tagInfo = new Map<string, string>(((spec.tags ?? []) as Json[]).map((t) => [t.name, String(t.description ?? "")]));
      const byTag = new Map<string, RefOperation[]>();
      for (const [path, item] of Object.entries<Json>(spec.paths)) {
        for (const method of METHODS) {
          if (!item[method]) continue;
          const op = buildOperation(spec, path, method, item[method]);
          byTag.set(op.tag, [...(byTag.get(op.tag) ?? []), op]);
        }
      }
      const groups = ((spec["x-tagGroups"] ?? []) as Json[]).map((g) => ({
        name: String(g.name),
        tags: (g.tags as string[]).map((name) => ({ name, description: tagInfo.get(name) ?? "", operations: byTag.get(name) ?? [] })),
      }));
      return { title: String(spec.info?.title ?? "API"), version: String(spec.info?.version ?? ""), groups };
    })
    .catch((error) => {
      modelPromise = null;
      throw error;
    });
  return modelPromise;
}

// ---------------------------------------------------------------- nümunə sorğu (path + query + body)
export function exampleRequest(op: RefOperation, origin: string) {
  let path = op.path;
  const query: [string, string][] = [];
  for (const p of op.params) {
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(String(p.example ?? 1)));
    else if (p.in === "query" && p.example !== undefined && (p.required || op.method === "GET")) query.push([p.name, String(p.example)]);
  }
  // GET-də yalnız məcburi + ən çox 3 əlavə nümunə parametr (nümunə qısa qalsın)
  const shown = op.method === "GET" ? query.filter(([name]) => op.params.find((p) => p.name === name)?.required).concat(query.filter(([name]) => !op.params.find((p) => p.name === name)?.required).slice(0, 2)) : query;
  const qs = new URLSearchParams(shown).toString();
  const body = op.bodyExamples[0]?.value;
  return { url: `${origin}${path}${qs ? `?${qs}` : ""}`, path: `${path}${qs ? `?${qs}` : ""}`, body };
}

const formEncode = (body: unknown) => new URLSearchParams(Object.entries((body ?? {}) as Record<string, string>).map(([k, v]) => [k, String(v)])).toString();

export type CodeLang = "curl" | "javascript" | "python";
export function codeSample(op: RefOperation, lang: CodeLang, origin: string): string {
  const { url, body } = exampleRequest(op, origin);
  const form = op.contentType === "application/x-www-form-urlencoded";
  const headers: [string, string][] = [];
  if (op.auth === "bearer") headers.push(["Authorization", "Bearer $ACCESS_TOKEN"]);
  if (op.auth === "apiKey") headers.push(["X-API-Key", "apilab-demo-key-2026"]);
  if (body !== undefined) headers.push(["Content-Type", op.contentType ?? "application/json"]);
  if (lang === "curl") {
    const lines = [`curl -X ${op.method} "${url}"`, ...headers.map(([k, v]) => `-H "${k}: ${v}"`)];
    if (body !== undefined) {
      if (form) lines.push(...Object.entries(body as Record<string, string>).map(([k, v]) => `--data-urlencode "${k}=${v}"`));
      else lines.push(`-d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`);
    }
    return lines.join(" \\\n  ");
  }
  if (lang === "javascript") {
    const h = headers.map(([k, v]) => `    "${k}": ${v.includes("$ACCESS_TOKEN") ? "`Bearer ${accessToken}`" : JSON.stringify(v)},`).join("\n");
    const b = body === undefined ? "" : form ? `\n  body: new URLSearchParams(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),` : `\n  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),`;
    return `const response = await fetch("${url}", {\n  method: "${op.method}",${h ? `\n  headers: {\n${h}\n  },` : ""}${b}\n});\nconst data = await response.json();\nconsole.log(response.status, data);`;
  }
  const h = headers.filter(([k]) => k !== "Content-Type").map(([k, v]) => `    "${k}": ${v.includes("$ACCESS_TOKEN") ? 'f"Bearer {access_token}"' : JSON.stringify(v)},`).join("\n");
  const py = (v: unknown) => JSON.stringify(v, null, 4).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
  const b = body === undefined ? "" : form ? `,\n    data=${py(body).replace(/\n/g, "\n    ")}` : `,\n    json=${py(body).replace(/\n/g, "\n    ")}`;
  return `import requests\n\nresponse = requests.${op.method.toLowerCase()}(\n    "${url}"${h ? `,\n    headers={\n${h}\n    }` : ""}${b},\n)\nprint(response.status_code, response.json())`;
}

export const encodeForm = formEncode;

// ---------------------------------------------------------------- API token (token endpoint-indən alınan)
// sessionStorage: brauzer bağlananda silinir. Callbox GUI Bearer tələb edən sorğulara bunu avtomatik qoyur.
export type ApiToken = { accessToken: string; refreshToken: string; expiresAt: number; scope: string; username?: string };
const TOKEN_KEY = "callbox.apiToken";
const listeners = new Set<() => void>();

export const apiToken = {
  get(): ApiToken | null {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as ApiToken) : null;
    } catch {
      return null;
    }
  },
  setFromResponse(body: unknown, username?: string): ApiToken | null {
    const b = body as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string } | null;
    if (!b?.access_token) return null;
    const token: ApiToken = { accessToken: b.access_token, refreshToken: b.refresh_token ?? "", expiresAt: Date.now() + (b.expires_in ?? 900) * 1000, scope: b.scope ?? "", username };
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    } catch {
      // yaddaş bağlıdırsa token yalnız bu sorğu üçün istifadə olunur
    }
    listeners.forEach((l) => l());
    return token;
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // yox
    }
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export async function requestToken(form: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${SERVER_URL}${TOKEN_PATH}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: formEncode(form) });
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) apiToken.setFromResponse(body, form.username);
  return { status: res.status, body };
}
