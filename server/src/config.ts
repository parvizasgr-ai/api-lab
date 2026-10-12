// Konfiqurasiya: bütün parametrlər env dəyişənlərindən oxunur (12-factor app prinsipi).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? path.join(ROOT_DIR, 'data', 'apilab.db'),
  migrationsDir: path.join(ROOT_DIR, 'db', 'migrations'),
  seedDir: path.join(ROOT_DIR, 'db', 'seed'),
};
