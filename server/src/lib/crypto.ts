// Kriptoqrafik köməkçilər: yalnız Node-un daxili `crypto` modulu.
import crypto from 'node:crypto';

export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (prefix: string, bytes = 24): string =>
  `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;

// Parol formatı: scrypt$<salt hex>$<hash hex>. Müqayisə timingSafeEqual ilə (timing attack qorunması).
export function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}

export const isoNow = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const isoAfter = (d: Date, seconds: number): string => isoNow(new Date(d.getTime() + seconds * 1000));
