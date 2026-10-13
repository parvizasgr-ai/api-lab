// openapi/openapi.yaml → openapi/openapi.json (server /api/openapi.json olaraq bunu verir).
// YAML — insan üçün (redaktə), JSON — maşın üçün (Swagger UI, Postman, ajv).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../server/src/config.js';
import { loadOpenApiFromYaml, listOperations } from '../server/src/openapi/spec.js';

const spec = loadOpenApiFromYaml();
const out = path.join(ROOT_DIR, 'openapi', 'openapi.json');
fs.writeFileSync(out, JSON.stringify(spec, null, 2) + '\n');

const ops = listOperations(spec);
const byTag = new Map<string, number>();
for (const op of ops) byTag.set(op.tag, (byTag.get(op.tag) ?? 0) + 1);
console.log(`openapi.json yazıldı: ${ops.length} endpoint, ${Object.keys(spec.paths).length} path`);
console.table([...byTag].map(([tag, endpoints]) => ({ tag, endpoints })));
