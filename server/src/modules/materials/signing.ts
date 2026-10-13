// Pre-signed URL: path + bitmə vaxtı server sirri ilə imzalanır (HMAC-SHA256).
// URL-i bilən hər kəs onu müddət bitənə qədər istifadə edə bilər — <img src> Authorization başlığı göndərə bilmədiyi üçün.
import crypto from 'node:crypto';
import type { Config } from '../../config.js';

const hmac = (secret: string, p: string, exp: number) => crypto.createHmac('sha256', secret).update(`${p}:${exp}`).digest('hex');

export function signPath(config: Config, p: string): string {
  const exp = Math.floor(config.now().getTime() / 1000) + config.materials.signedUrlTtlSec;
  return `${p}?exp=${exp}&sig=${hmac(config.jwtSecret, p, exp)}`;
}

export function verifySignature(config: Config, p: string, exp?: number, sig?: string): boolean {
  if (!exp || !sig) return false;
  if (exp < Math.floor(config.now().getTime() / 1000)) return false;
  const expected = Buffer.from(hmac(config.jwtSecret, p, exp), 'hex');
  const actual = Buffer.from(sig, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
