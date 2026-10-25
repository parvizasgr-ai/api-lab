// Migration + seed fayllarının hash-i: test bazaları yalnız bu dəyişəndə yenidən yaradılır (DROP/CREATE DATABASE bahalıdır).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../../server/src/config.js';

export function schemaFingerprint(): string {
  const hash = crypto.createHash('sha256');
  for (const dir of ['db/migrations', 'db/seed']) {
    for (const file of fs.readdirSync(path.join(ROOT_DIR, dir)).filter((f) => f.endsWith('.sql')).sort()) {
      hash.update(`${dir}/${file}\n`).update(fs.readFileSync(path.join(ROOT_DIR, dir, file)));
    }
  }
  return hash.digest('hex').slice(0, 16);
}
