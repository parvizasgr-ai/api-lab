// Serverin başlanğıc nöqtəsi: npm run dev
import { config } from './config.js';
import { openDb, migrate, resetDatabase, userTables } from './db.js';
import { createApp } from './app.js';
import { detectTools } from './modules/materials/tools.js';
import { importSlides } from './modules/materials/slides.js';
import { materialsRepo } from './modules/materials/repo.js';
import type { MaterialsService } from './modules/materials/service.js';

const db = openDb();
if (userTables(db).length === 0) {
  console.log('DB boşdur — migration + seed işlədilir...');
  resetDatabase(db);
} else {
  const applied = migrate(db);
  if (applied.length) console.log('Yeni migration-lar:', applied.join(', '));
}

const app = createApp({ db });
const materials = app.locals.materials as MaterialsService;

// Konvertasiya alətləri: yoxdursa materiallar READY_NO_PREVIEW olur (yalnız endirmə)
const tools = detectTools(config);
console.log(`Material alətləri: soffice ${tools.soffice ? `✓ (${tools.soffice})` : '✗ — PPTX/DOCX önizləməsi yoxdur'}, pdftoppm ${tools.pdftoppm ? `✓ (${tools.pdftoppm})` : '✗ — PDF səhifə şəkilləri yoxdur'}`);
if (!tools.soffice || !tools.pdftoppm) console.log('  Quraşdırma: README → "Dərs materialları"');

// materials/slides/ qovluğundakı yeni fayllar + yarımçıq qalmış konvertasiyalar
for (const r of importSlides(db, materials, config.materials.slidesDir)) {
  console.log(r.error ? `  ⚠ ${r.file}: ${r.error}` : `  + ${r.file} → material #${r.id}`);
}
for (const id of materialsRepo.byStatus(db, ['UPLOADED', 'CONVERTING'])) materials.queue.enqueue(id);

app.listen(config.port, () => {
  console.log(`API Lab: ${config.publicUrl}`);
  console.log(`  Health:  ${config.publicUrl}/api/v1/health`);
  console.log(`  OpenAPI: ${config.publicUrl}/api/openapi.json`);
  console.log(`  Docs:    ${config.publicUrl}/docs`);
  if (app.locals.unimplemented.length) console.warn(`  Hələ implementasiya olunmayıb (501): ${app.locals.unimplemented.join(', ')}`);
});
