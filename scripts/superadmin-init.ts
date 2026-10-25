// npm run superadmin:init [-- --username parviz --name "Parviz Asgarov"]
// Güclü parol yaradır, .env-ə SUPERADMIN_* yazır (varsa toxunmur) və hesabı DB-də yaradır/yeniləyir.
// Parol yalnız bir dəfə ekranda göstərilir; .env gitignore-dadır.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, config } from '../server/src/config.js';
import { openDb } from '../server/src/db.js';
import { ensureSuperadmin } from '../server/src/lib/exposure.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const envFile = path.join(ROOT_DIR, '.env');
const current = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

let { username, password, name } = config.superadmin;
if (username && password && !arg('username')) {
  console.log(`Superadmin artıq .env-dədir: ${username} (parolu dəyişmək üçün .env-də SUPERADMIN_PASSWORD-u dəyişin)`);
} else {
  username = arg('username') ?? 'muellim';
  name = arg('name') ?? name;
  if (!/^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/.test(username)) {
    console.error('username: kiçik hərflər, rəqəmlər, . və _ (3–30)');
    process.exit(1);
  }
  password = crypto.randomBytes(12).toString('base64url');
  const lines = current.split('\n').filter((l) => !/^SUPERADMIN_(USERNAME|PASSWORD|NAME)=/.test(l));
  lines.push(`SUPERADMIN_USERNAME=${username}`, `SUPERADMIN_PASSWORD=${password}`, `SUPERADMIN_NAME=${name}`);
  fs.writeFileSync(envFile, lines.join('\n').replace(/^\n+/, '') + '\n', { mode: 0o600 });
  console.log(`.env yeniləndi: SUPERADMIN_USERNAME=${username}`);
  console.log(`\n  Parol (bir dəfə göstərilir, .env-də də var): ${password}\n`);
}

const db = openDb();
await ensureSuperadmin(db, { superadmin: { username, password, name } });
await db.close();
console.log(`Superadmin hazırdır: ${username} → http://localhost:3000/admin (serveri yenidən başladın)`);
