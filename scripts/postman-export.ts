// npm run postman:export — Postman collection və environment fayllarını postman/ qovluğuna yazır (Import üçün).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, config } from '../server/src/config.js';
import { loadOpenApiFromYaml } from '../server/src/openapi/spec.js';
import { buildCollection, buildEnvironment } from '../server/src/postman/collection.js';

const dir = path.join(ROOT_DIR, 'postman');
fs.mkdirSync(dir, { recursive: true });
const collection = buildCollection(loadOpenApiFromYaml());
fs.writeFileSync(path.join(dir, 'api-lab.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'api-lab.postman_environment.json'), JSON.stringify(buildEnvironment(config.publicUrl), null, 2) + '\n');
console.log(`Postman faylları yazıldı: ${dir} (${collection.item.reduce((n, f) => n + f.item.length, 0)} sorğu)`);
