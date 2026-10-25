// Server şəbəkəyə (LAN/sinif) açılanda təhlükəsizlik minimumu.
//   * HOST default 127.0.0.1 — yalnız bu kompüter. Sinif üçün HOST=0.0.0.0 (və ya LAN IP) açıq şəkildə verilməlidir.
//   * Şəbəkəyə açıqdırsa: JWT_SECRET repo-dakı default ola bilməz (hər kəs ADMIN token düzəldə bilər) və
//     ADMIN_PASSWORD verilməlidir (admin/admin123 README-də yazılıb — tələbə admin kimi daxil olub DB-ni sıfırlaya bilər).
//   * ADMIN_PASSWORD hər başlanğıcda və hər /_reset-dən sonra tətbiq olunur (seed onu admin123-ə qaytarmasın).
import type { DB } from '../db.js';
import type { Config } from '../config.js';
import { hashPassword } from './crypto.js';

export const DEFAULT_JWT_SECRET = 'apilab-dev-secret-change-me-0123456789abcdef';
const DEMO_PASSWORDS = new Set(['admin123', 'student123', 'rauf123', 'admin', 'password']);

export const isLoopbackHost = (host: string) => ['127.0.0.1', '::1', 'localhost'].includes(host.trim().toLowerCase());

// Şəbəkəyə açıq rejimdə başlamağa mane olan problemlər (boşdursa — hər şey qaydasındadır)
export function exposureProblems(config: Pick<Config, 'host' | 'jwtSecret' | 'adminPassword'>): string[] {
  if (isLoopbackHost(config.host)) return [];
  const problems: string[] = [];
  if (config.jwtSecret === DEFAULT_JWT_SECRET) problems.push('JWT_SECRET repo-dakı default dəyərdir — şəbəkədəki hər kəs ADMIN token düzəldə bilər');
  else if (config.jwtSecret.length < 32) problems.push('JWT_SECRET ən azı 32 simvol olmalıdır');
  if (!config.adminPassword) problems.push('ADMIN_PASSWORD verilməyib — admin/admin123 README-də açıqdır');
  else if (config.adminPassword.length < 10 || DEMO_PASSWORDS.has(config.adminPassword)) problems.push('ADMIN_PASSWORD ən azı 10 simvol olmalı və demo parol olmamalıdır');
  return problems;
}

// Superadmin (müəllim) — .env-dən; yoxdursa yaradılır, varsa parol/ad/rol yenilənir. DB sıfırlananda da itmir.
export async function ensureSuperadmin(db: DB, config: Pick<Config, 'superadmin'>): Promise<boolean> {
  const { username, password, name } = config.superadmin;
  if (!username || !password) return false;
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ') || null;
  const id = (await db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, first_name, last_name, group_name, email, role)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, 'SUPERADMIN')
       ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name,
         first_name = excluded.first_name, last_name = excluded.last_name, role = 'SUPERADMIN', updated_at = iso_now()
       RETURNING id`,
    )
    .pluck()
    .get(username, hashPassword(password), name.trim(), firstName, lastName)) as number;
  for (const scope of [...SUPERADMIN_SCOPES]) {
    await db.prepare(`INSERT INTO user_scopes (user_id, scope) VALUES (?, ?) ON CONFLICT DO NOTHING`).run(id, scope);
  }
  return true;
}

export const SUPERADMIN_SCOPES = ['accounts:read', 'cards:read', 'cards:write', 'transfers:write', 'bookings:read', 'bookings:write', 'books:write', 'music:read', 'music:write', 'admin', 'superadmin'];

// ADMIN_PASSWORD verilibsə admin istifadəçisinin parolunu onunla əvəz edir (seed-dən sonra da)
export async function applyAdminPassword(db: DB, config: Pick<Config, 'adminPassword'>): Promise<boolean> {
  if (!config.adminPassword) return false;
  return (await db.prepare(`UPDATE users SET password_hash = ? WHERE username = 'admin'`).run(hashPassword(config.adminPassword))).changes > 0;
}
