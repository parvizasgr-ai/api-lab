// npm run db:reset — public sxemi silinir → migration-lar → seed; materiallar yenidən import olunur.
import { config } from '../server/src/config.js';
import { openDb, resetDatabase, tableCounts } from '../server/src/db.js';
import { applyAdminPassword } from '../server/src/lib/exposure.js';
import { MaterialsService } from '../server/src/modules/materials/service.js';
import { importSlides } from '../server/src/modules/materials/slides.js';

const db = openDb();
await resetDatabase(db);
await applyAdminPassword(db, config);
// Material faylları DB ilə birlikdə sıfırlanır, materials/slides/ yenidən import olunur
const materials = new MaterialsService({ db, config });
materials.storage.clear();
await importSlides(db, materials, config.materials.slidesDir);
await materials.queue.idle();

const counts = await tableCounts(db);
const views = await db.prepare(`SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY 1`).pluck().all();
const triggers = await db.prepare(`SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY 1`).pluck().all();
console.log(`DB sıfırlandı (${db.database}): ${counts.length} cədvəl, ${views.length} view, ${triggers.length} trigger`);
console.table(counts);
if (views.length) console.log('Views:', views.join(', '));
if (triggers.length) console.log('Triggers:', triggers.join(', '));
await db.close();
