// Serverin başlanğıc nöqtəsi: npm run dev
import { config } from './config.js';
import { applyAdminPassword, exposureProblems, isLoopbackHost } from './lib/exposure.js';
import { openDb, migrate, resetDatabase, userTables } from './db.js';
import { createApp } from './app.js';
import { detectTools } from './modules/materials/tools.js';
import { importSlides } from './modules/materials/slides.js';
import { materialsRepo } from './modules/materials/repo.js';
import type { MaterialsService } from './modules/materials/service.js';

// Şəbəkəyə açıq rejimdə zəif konfiqurasiya ilə başlamırıq (sinif Wi-Fi-ında hər kəs ADMIN ola bilərdi)
const problems = exposureProblems(config);
if (problems.length) {
  console.error(`\nHOST=${config.host} — server şəbəkəyə açılır, amma təhlükəsiz deyil:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nHazırlıq: npm run classroom:check -- --lan  (bələdçi: docs/classroom-setup.md)\n');
  process.exit(1);
}

const db = openDb();
if (userTables(db).length === 0) {
  console.log('DB boşdur — migration + seed işlədilir...');
  resetDatabase(db);
} else {
  const applied = migrate(db);
  if (applied.length) console.log('Yeni migration-lar:', applied.join(', '));
}

if (applyAdminPassword(db, config)) console.log('ADMIN_PASSWORD tətbiq olundu (admin istifadəçisi)');

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

app.listen(config.port, config.host, () => {
  console.log(`API Lab: ${config.publicUrl}  (dinləyir: ${config.host}:${config.port}${isLoopbackHost(config.host) ? ' — yalnız bu kompüter' : ' — şəbəkəyə açıq'})`);
  console.log(`  Health:  ${config.publicUrl}/api/v1/health`);
  console.log(`  OpenAPI: ${config.publicUrl}/api/openapi.json`);
  console.log(`  Docs:    ${config.publicUrl}/docs`);
  if (app.locals.unimplemented.length) console.warn(`  Hələ implementasiya olunmayıb (501): ${app.locals.unimplemented.join(', ')}`);
});
