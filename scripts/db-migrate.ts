import { openDb, migrate } from '../server/src/db.js';

const db = openDb();
const done = await migrate(db);
console.log(done.length ? `Tətbiq olundu: ${done.join(', ')}` : 'Yeni migration yoxdur.');
await db.close();
