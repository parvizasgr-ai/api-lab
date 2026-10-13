// Serverin başlanğıc nöqtəsi: npm run dev
import { config } from './config.js';
import { openDb, migrate, resetDatabase, userTables } from './db.js';
import { createApp } from './app.js';

const db = openDb();
if (userTables(db).length === 0) {
  console.log('DB boşdur — migration + seed işlədilir...');
  resetDatabase(db);
} else {
  const applied = migrate(db);
  if (applied.length) console.log('Yeni migration-lar:', applied.join(', '));
}

createApp({ db }).listen(config.port, () => {
  console.log(`API Lab: ${config.publicUrl}`);
  console.log(`  Health:  ${config.publicUrl}/api/v1/health`);
  console.log(`  OpenAPI: ${config.publicUrl}/api/openapi.json`);
});
