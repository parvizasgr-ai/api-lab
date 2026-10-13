// Məzənnələr: çarpaz kurs (cross rate) AZN üzərindən hesablanır.
//   1 X = (AZN→Y) / (AZN→X) Y.  Məs. 1 USD = (1 AZN→AZN = 1) / (1 AZN = 0.588235 USD) = 1.70 AZN.
import type { DB } from '../../db.js';
import { ApiError } from '../../errors.js';
import { currencyRepo } from './repo.js';

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export class CurrencyService {
  constructor(private db: DB) {}

  listCurrencies() {
    return { items: currencyRepo.listCurrencies(this.db) };
  }

  // AZN → hər valyuta (AZN özü = 1)
  private aznTable(date?: string): { date: string; table: Map<string, number> } {
    const resolved = date ? date : currencyRepo.latestDate(this.db);
    const rows = resolved ? currencyRepo.ratesOn(this.db, resolved) : [];
    if (!resolved || !rows.length) throw new ApiError(404, 'RATE_NOT_FOUND', `Bu tarix üçün məzənnə tapılmadı${date ? `: ${date}` : ''}`);
    const table = new Map<string, number>([['AZN', 1]]);
    for (const r of rows) table.set(r.quote, r.rate);
    return { date: resolved, table };
  }

  private cross(table: Map<string, number>, from: string, to: string): number {
    const a = table.get(from);
    const b = table.get(to);
    if (a === undefined || b === undefined) throw new ApiError(404, 'RATE_NOT_FOUND', `${from}/${to} üçün məzənnə yoxdur`);
    return b / a;
  }

  rates(base = 'AZN', date?: string) {
    const { date: d, table } = this.aznTable(date);
    const rates: Record<string, number> = {};
    for (const code of table.keys()) if (code !== base) rates[code] = round(this.cross(table, base, code), 6);
    return { base, date: d, rates };
  }

  convert(from: string, to: string, amount: number) {
    const { date, table } = this.aznTable();
    const rate = round(this.cross(table, from, to), 6);
    return { from, to, amount, rate, result: round(amount * rate, 2), date };
  }

  history(from: string, to: string, days: number) {
    const dates = currencyRepo.lastDates(this.db, days).reverse();
    if (!dates.length) throw new ApiError(404, 'RATE_NOT_FOUND', 'Məzənnə tarixçəsi yoxdur');
    const points = dates.map((date) => ({ date, rate: round(this.cross(this.aznTable(date).table, from, to), 6) }));
    return { from, to, days: points.length, points };
  }
}
