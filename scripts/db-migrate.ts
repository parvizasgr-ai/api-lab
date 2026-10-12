import { openDb, migrate } from '../server/src/db.js';

const db = openDb();
const done = migrate(db);
console.log(done.length ? `Tətbiq olundu: ${done.join(', ')}` : 'Yeni migration yoxdur.');
