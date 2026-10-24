import { openDb, migrate, seed, tableCounts } from '../server/src/db.js';

const db = openDb();
await migrate(db);
await seed(db);
console.table(await tableCounts(db));
await db.close();
