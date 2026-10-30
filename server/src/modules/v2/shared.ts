// Callbox API v2 — ümumi köməkçilər (Stripe üslubu: obyektdə `object` sahəsi, siyahıda {object:'list', data, hasMore, url}).
import crypto from 'node:crypto';
import { ApiError } from '../../errors.js';

export const list = <T>(url: string, data: T[], hasMore = false) => ({ object: 'list' as const, url, hasMore, data });

export const money = (minor: number) => Math.round(minor) / 100;

export const today = (now: Date) => now.toISOString().slice(0, 10);

// YYYY-MM-DD → gün fərqi (UTC)
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// Tarixə ay əlavə et (ay sonu düzəlişi: 31 yanvar + 1 ay → 28/29 fevral)
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Tam yaş (verilən tarixdə)
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// Qarışıq salınmayan simvollar (0/O, 1/I yoxdur) — PNR və təsdiq kodları üçün
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = (length: number) =>
  Array.from(crypto.randomBytes(length), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

export const invalid = (code: string, message: string, field: string, detail = message) =>
  new ApiError(422, code, message, [{ field, message: detail }]);
