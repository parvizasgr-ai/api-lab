// npm run materials:seed — materials/slides/ qovluğundakı yeni faylları import edir və konvertasiyanın bitməsini gözləyir.
import { config } from '../server/src/config.js';
import { openDb, migrate } from '../server/src/db.js';
import { MaterialsService } from '../server/src/modules/materials/service.js';
import { importSlides } from '../server/src/modules/materials/slides.js';
import { detectTools } from '../server/src/modules/materials/tools.js';

const db = openDb();
migrate(db);
const materials = new MaterialsService({ db, config });
const tools = detectTools(config);
console.log(`soffice: ${tools.soffice ?? '✗'}, pdftoppm: ${tools.pdftoppm ?? '✗'}`);
const result = importSlides(db, materials, config.materials.slidesDir);
if (!result.length) console.log(`Yeni fayl yoxdur (${config.materials.slidesDir}).`);
await materials.queue.idle();
console.table(
  db.prepare(`SELECT material_id AS id, lesson, title, status, pages, tasks, original_filename FROM v_material_overview ORDER BY lesson, material_id`).all(),
);
for (const r of result) if (r.error) console.warn(`⚠ ${r.file}: ${r.error}`);
