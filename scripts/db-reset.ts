import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../server/src/config.js';
import { openDb, resetDatabase, tableCounts, dumpSchema } from '../server/src/db.js';

const db = openDb();
resetDatabase(db);
fs.writeFileSync(path.join(ROOT_DIR, 'db', 'schema.sql'), dumpSchema(db));

const counts = tableCounts(db);
const views = db.prepare(`SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`).pluck().all();
const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`).pluck().all();
console.log(`DB sıfırlandı: ${counts.length} cədvəl, ${views.length} view, ${triggers.length} trigger`);
console.table(counts);
if (views.length) console.log('Views:', views.join(', '));
if (triggers.length) console.log('Triggers:', triggers.join(', '));
