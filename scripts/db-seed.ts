import { openDb, migrate, seed, tableCounts } from '../server/src/db.js';

const db = openDb();
migrate(db);
seed(db);
console.table(tableCounts(db));
