// MongoDB simulyasiyası: sənəd bazası (collection → JSON sənədləri, _id = ObjectId).
// Sənədlər PostgreSQL-də docstore.documents (JSONB) cədvəlində saxlanılır — server yenidən başlayanda itmir.
// Sorğu dili MongoDB-nin alt çoxluğudur: find(filter, projection, sort, limit), countDocuments, aggregate(pipeline).
// Tələbə sorğuları yalnız oxuyur; yazma yalnız API-dən (hotel rəyləri, Kafka → bildirişlər).
import crypto from 'node:crypto';
import type { DB } from '../db.js';

export type Doc = Record<string, unknown> & { _id: string };
export type Filter = Record<string, unknown>;

export class MongoQueryError extends Error {
  constructor(
    message: string,
    readonly notAllowed = false,
  ) {
    super(message);
  }
}

// ObjectId: 4 bayt vaxt (saniyə) + 5 bayt təsadüfi + 3 bayt sayğac → 24 hex simvol
let counter = crypto.randomInt(0xffffff);
const processRandom = crypto.randomBytes(5).toString('hex');
export function objectId(now: Date): string {
  counter = (counter + 1) % 0xffffff;
  return Math.floor(now.getTime() / 1000).toString(16).padStart(8, '0') + processRandom + counter.toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------- dəyərlər
const typeRank = (v: unknown): number => {
  if (v === undefined || v === null) return 1;
  if (typeof v === 'number') return 2;
  if (typeof v === 'string') return 3;
  if (Array.isArray(v)) return 5;
  if (typeof v === 'object') return 4;
  if (typeof v === 'boolean') return 6;
  return 7;
};

export function compare(a: unknown, b: unknown): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
}

const deepEqual = (a: unknown, b: unknown) => (a === b ? true : typeRank(a) === typeRank(b) && JSON.stringify(a) === JSON.stringify(b));

// "stay.tripType", "pros.0" → dəyər(lər). Massiv yol boyu açılır (Mongo kimi: {tags: 'wifi'} massivdə axtarır).
function valuesAt(doc: unknown, path: string): unknown[] {
  const parts = path.split('.');
  let current: unknown[] = [doc];
  for (const part of parts) {
    const next: unknown[] = [];
    for (const v of current) {
      if (Array.isArray(v)) {
        if (/^\d+$/.test(part)) next.push(v[Number(part)]);
        else for (const item of v) if (item && typeof item === 'object') next.push((item as Record<string, unknown>)[part]);
      } else if (v && typeof v === 'object') next.push((v as Record<string, unknown>)[part]);
      else next.push(undefined);
    }
    current = next;
  }
  return current;
}

export function getPath(doc: unknown, path: string): unknown {
  return valuesAt(doc, path)[0];
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object') node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------- filter
const isOperatorObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));

const BLOCKED = new Set(['$where', '$function', '$accumulator', '$expr', '$jsonSchema', '$text', '$near', '$geoWithin']);

function regexOf(pattern: unknown, options: unknown): RegExp {
  if (typeof pattern !== 'string' || pattern.length > 100) throw new MongoQueryError('$regex — ən çox 100 simvolluq string olmalıdır');
  const flags = typeof options === 'string' ? options.replace(/[^imsx]/g, '').replace('x', '') : '';
  try {
    return new RegExp(pattern, flags);
  } catch {
    throw new MongoQueryError(`$regex yanlışdır: ${pattern}`);
  }
}

function matchOperator(values: unknown[], op: string, arg: unknown, all: Record<string, unknown>): boolean {
  // massiv sahəsi: elementlərdən biri uyğun gəlsə kifayətdir
  const flat = values.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]));
  switch (op) {
    case '$eq':
      return flat.some((v) => deepEqual(v, arg));
    case '$ne':
      return !flat.some((v) => deepEqual(v, arg));
    case '$gt':
      return flat.some((v) => v !== undefined && typeRank(v) === typeRank(arg) && compare(v, arg) > 0);
    case '$gte':
      return flat.some((v) => v !== undefined && typeRank(v) === typeRank(arg) && compare(v, arg) >= 0);
    case '$lt':
      return flat.some((v) => v !== undefined && typeRank(v) === typeRank(arg) && compare(v, arg) < 0);
    case '$lte':
      return flat.some((v) => v !== undefined && typeRank(v) === typeRank(arg) && compare(v, arg) <= 0);
    case '$in':
      if (!Array.isArray(arg)) throw new MongoQueryError('$in massiv tələb edir');
      return flat.some((v) => arg.some((a) => deepEqual(v, a)));
    case '$nin':
      if (!Array.isArray(arg)) throw new MongoQueryError('$nin massiv tələb edir');
      return !flat.some((v) => arg.some((a) => deepEqual(v, a)));
    case '$exists':
      return values.some((v) => v !== undefined) === Boolean(arg);
    case '$size':
      return values.some((v) => Array.isArray(v) && v.length === arg);
    case '$all':
      if (!Array.isArray(arg)) throw new MongoQueryError('$all massiv tələb edir');
      return values.some((v) => Array.isArray(v) && arg.every((a) => v.some((x) => deepEqual(x, a))));
    case '$elemMatch':
      return values.some((v) => Array.isArray(v) && v.some((item) => matches(item, arg as Filter)));
    case '$regex': {
      const re = regexOf(arg, all.$options);
      return flat.some((v) => typeof v === 'string' && re.test(v));
    }
    case '$options':
      return true;
    case '$not':
      return !matchValue(values, arg);
    default:
      throw new MongoQueryError(BLOCKED.has(op) ? `${op} icazəli deyil (server tərəfində kod icrası / tədris sandbox-u)` : `naməlum operator: ${op}`, BLOCKED.has(op));
  }
}

function matchValue(values: unknown[], condition: unknown): boolean {
  if (isOperatorObject(condition)) return Object.entries(condition).every(([op, arg]) => matchOperator(values, op, arg, condition));
  return matchOperator(values, '$eq', condition, {});
}

export function matches(doc: unknown, filter: Filter): boolean {
  for (const [key, condition] of Object.entries(filter ?? {})) {
    if (key === '$and' || key === '$or' || key === '$nor') {
      if (!Array.isArray(condition) || !condition.length) throw new MongoQueryError(`${key} boş olmayan massiv tələb edir`);
      const results = condition.map((f) => matches(doc, f as Filter));
      if (key === '$and' && !results.every(Boolean)) return false;
      if (key === '$or' && !results.some(Boolean)) return false;
      if (key === '$nor' && results.some(Boolean)) return false;
      continue;
    }
    if (key.startsWith('$')) throw new MongoQueryError(BLOCKED.has(key) ? `${key} icazəli deyil` : `naməlum operator: ${key}`, BLOCKED.has(key));
    if (!matchValue(valuesAt(doc, key), condition)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- projection, sort
export function project(doc: Doc, projection?: Record<string, unknown>): Record<string, unknown> {
  if (!projection || !Object.keys(projection).length) return doc;
  const entries = Object.entries(projection);
  const inclusive = entries.some(([k, v]) => k !== '_id' && (v === 1 || v === true));
  const exclusive = entries.some(([k, v]) => k !== '_id' && (v === 0 || v === false));
  if (inclusive && exclusive) throw new MongoQueryError('projection: inclusion (1) və exclusion (0) qarışdırıla bilməz (_id istisna)');
  if (inclusive) {
    const out: Record<string, unknown> = {};
    if (projection._id !== 0 && projection._id !== false) out._id = doc._id;
    for (const [k, v] of entries) if (k !== '_id' && (v === 1 || v === true) && getPath(doc, k) !== undefined) setPath(out, k, getPath(doc, k));
    return out;
  }
  const out = structuredClone(doc) as Record<string, unknown>;
  for (const [k, v] of entries) {
    if (v !== 0 && v !== false) continue;
    const parts = k.split('.');
    let node = out;
    for (const part of parts.slice(0, -1)) node = (node?.[part] ?? {}) as Record<string, unknown>;
    delete node[parts[parts.length - 1]];
  }
  return out;
}

export function sortDocs<T>(docs: T[], sort?: Record<string, unknown>): T[] {
  const keys = Object.entries(sort ?? {});
  if (!keys.length) return docs;
  for (const [, dir] of keys) if (dir !== 1 && dir !== -1) throw new MongoQueryError('sort dəyəri 1 və ya -1 olmalıdır');
  return [...docs].sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = compare(getPath(a, k), getPath(b, k));
      if (c) return c * (dir as number);
    }
    return 0;
  });
}

// ---------------------------------------------------------------- aggregate
const ACCUMULATORS = new Set(['$sum', '$avg', '$min', '$max', '$first', '$last', '$push', '$addToSet', '$count']);
const STAGES = new Set(['$match', '$project', '$sort', '$limit', '$skip', '$group', '$count', '$unwind']);
const WRITE_STAGES = new Set(['$out', '$merge', '$lookup', '$graphLookup', '$unionWith', '$function']);

function evalExpr(doc: unknown, expr: unknown): unknown {
  if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1));
  if (expr && typeof expr === 'object' && !Array.isArray(expr)) {
    const keys = Object.keys(expr);
    if (keys.length && keys.every((k) => k.startsWith('$'))) throw new MongoQueryError(`ifadə operatorları dəstəklənmir: ${keys[0]} (yalnız "$sahə" və sabitlər)`);
    return Object.fromEntries(Object.entries(expr).map(([k, v]) => [k, evalExpr(doc, v)]));
  }
  return expr;
}

function group(docs: unknown[], spec: Record<string, unknown>): Record<string, unknown>[] {
  if (!('_id' in spec)) throw new MongoQueryError('$group üçün _id məcburidir (hamısı bir qrup: _id: null)');
  const buckets = new Map<string, { id: unknown; docs: unknown[] }>();
  for (const doc of docs) {
    const id = evalExpr(doc, spec._id) ?? null;
    const key = JSON.stringify(id);
    if (!buckets.has(key)) buckets.set(key, { id, docs: [] });
    buckets.get(key)!.docs.push(doc);
  }
  return [...buckets.values()].map(({ id, docs: members }) => {
    const out: Record<string, unknown> = { _id: id };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      if (!acc || typeof acc !== 'object' || Object.keys(acc).length !== 1) throw new MongoQueryError(`$group.${field}: { $sum: ... } kimi 1 akkumulyator olmalıdır`);
      const [op, arg] = Object.entries(acc)[0];
      if (!ACCUMULATORS.has(op)) throw new MongoQueryError(`naməlum akkumulyator: ${op}`);
      const vals = members.map((d) => evalExpr(d, arg));
      const nums = vals.filter((v): v is number => typeof v === 'number');
      if (op === '$sum') out[field] = nums.reduce((a, b) => a + b, 0);
      if (op === '$count') out[field] = members.length;
      if (op === '$avg') out[field] = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null;
      if (op === '$min') out[field] = vals.filter((v) => v != null).sort(compare)[0] ?? null;
      if (op === '$max') out[field] = vals.filter((v) => v != null).sort(compare).at(-1) ?? null;
      if (op === '$first') out[field] = vals[0] ?? null;
      if (op === '$last') out[field] = vals.at(-1) ?? null;
      if (op === '$push') out[field] = vals;
      if (op === '$addToSet') out[field] = vals.filter((v, i) => vals.findIndex((x) => deepEqual(x, v)) === i);
    }
    return out;
  });
}

export function aggregate(docs: Doc[], pipeline: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(pipeline)) throw new MongoQueryError('pipeline massiv olmalıdır');
  let rows: Record<string, unknown>[] = docs;
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object' || Object.keys(stage).length !== 1) throw new MongoQueryError('hər mərhələ 1 açarlı obyekt olmalıdır: { $match: {...} }');
    const [name, arg] = Object.entries(stage as Record<string, unknown>)[0];
    if (WRITE_STAGES.has(name)) throw new MongoQueryError(`${name} icazəli deyil (yazma və ya başqa kolleksiya — tədris sandbox-u yalnız oxuyur)`, true);
    if (!STAGES.has(name)) throw new MongoQueryError(`naməlum mərhələ: ${name}`);
    if (name === '$match') rows = rows.filter((d) => matches(d, arg as Filter));
    if (name === '$project') rows = rows.map((d) => projectStage(d, arg as Record<string, unknown>));
    if (name === '$sort') rows = sortDocs(rows, arg as Record<string, unknown>);
    if (name === '$skip') rows = rows.slice(positiveInt(arg, '$skip'));
    if (name === '$limit') rows = rows.slice(0, positiveInt(arg, '$limit'));
    if (name === '$group') rows = group(rows, arg as Record<string, unknown>);
    if (name === '$count') {
      if (typeof arg !== 'string' || !arg) throw new MongoQueryError('$count sahə adı tələb edir: { $count: "total" }');
      rows = [{ [arg]: rows.length }];
    }
    if (name === '$unwind') {
      const path = typeof arg === 'string' ? arg : (arg as { path?: string })?.path;
      if (typeof path !== 'string' || !path.startsWith('$')) throw new MongoQueryError('$unwind: "$sahə" formatında olmalıdır');
      rows = rows.flatMap((d) => {
        const v = getPath(d, path.slice(1));
        if (!Array.isArray(v)) return v === undefined ? [] : [d];
        return v.map((item) => {
          const copy = structuredClone(d);
          setPath(copy, path.slice(1), item);
          return copy;
        });
      });
    }
  }
  return rows;
}

function projectStage(doc: Record<string, unknown>, spec: Record<string, unknown>) {
  const computed = Object.values(spec).some((v) => typeof v === 'string' || (v && typeof v === 'object'));
  if (!computed) return project(doc as Doc, spec);
  const out: Record<string, unknown> = spec._id === 0 || spec._id === false ? {} : { _id: doc._id };
  for (const [k, v] of Object.entries(spec)) {
    if (k === '_id') continue;
    if (v === 1 || v === true) setPath(out, k, getPath(doc, k));
    else if (v !== 0 && v !== false) setPath(out, k, evalExpr(doc, v));
  }
  return out;
}

function positiveInt(v: unknown, name: string) {
  if (!Number.isInteger(v) || (v as number) < 0) throw new MongoQueryError(`${name} müsbət tam ədəd olmalıdır`);
  return v as number;
}

// ---------------------------------------------------------------- mongosh görünüşü (tələbə nə icra olunduğunu görsün)
// { "rating": { "$gte": 4 } } → {rating: {$gte: 4}} — sadə açarlar dırnaqsız, nöqtəli sahələr ("hotel.city") dırnaqla
export function shellJson(v: unknown): string {
  if (v === undefined) return '{}';
  if (Array.isArray(v)) return `[${v.map(shellJson).join(', ')}]`;
  if (v && typeof v === 'object') {
    const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
    return `{${Object.entries(v).map(([k, val]) => `${key(k)}: ${shellJson(val)}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------- saxlama (PostgreSQL JSONB)
export class MongoSim {
  constructor(
    private db: DB,
    private now: () => Date,
  ) {}

  async all(collection: string): Promise<Doc[]> {
    const rows = (await this.db.prepare(`SELECT doc FROM docstore.documents WHERE collection = ? ORDER BY id`).pluck().all(collection)) as Doc[];
    return rows;
  }

  async find(collection: string, filter: Filter = {}, options: { projection?: Record<string, unknown>; sort?: Record<string, unknown>; limit?: number; skip?: number } = {}) {
    const docs = sortDocs((await this.all(collection)).filter((d) => matches(d, filter)), options.sort);
    const sliced = docs.slice(options.skip ?? 0, options.limit ? (options.skip ?? 0) + options.limit : undefined);
    return sliced.map((d) => project(d, options.projection));
  }

  async findOne(collection: string, filter: Filter): Promise<Doc | null> {
    return ((await this.find(collection, filter, { limit: 1 }))[0] as Doc | undefined) ?? null;
  }

  async countDocuments(collection: string, filter: Filter = {}) {
    return (await this.all(collection)).filter((d) => matches(d, filter)).length;
  }

  async aggregate(collection: string, pipeline: unknown[]) {
    return aggregate(await this.all(collection), pipeline);
  }

  async insertOne(collection: string, doc: Record<string, unknown>): Promise<Doc> {
    const full = { _id: objectId(this.now()), ...doc } as Doc;
    await this.db.prepare(`INSERT INTO docstore.documents (collection, id, doc) VALUES (?, ?, ?::jsonb)`).run(collection, full._id, JSON.stringify(full));
    return full;
  }

  // $set ilə yeniləmə (yalnız server kodu istifadə edir)
  async updateOne(collection: string, id: string, set: Record<string, unknown>): Promise<Doc | null> {
    const doc = (await this.db.prepare(`SELECT doc FROM docstore.documents WHERE collection = ? AND id = ?`).pluck().get(collection, id)) as Doc | undefined;
    if (!doc) return null;
    for (const [k, v] of Object.entries(set)) setPath(doc, k, v);
    await this.db.prepare(`UPDATE docstore.documents SET doc = ?::jsonb WHERE collection = ? AND id = ?`).run(JSON.stringify(doc), collection, id);
    return doc;
  }

  async collections(): Promise<{ name: string; count: number }[]> {
    return (await this.db.prepare(`SELECT collection AS name, COUNT(*)::int AS count FROM docstore.documents GROUP BY collection ORDER BY collection`).all()) as {
      name: string;
      count: number;
    }[];
  }
}
