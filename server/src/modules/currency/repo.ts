// Valyuta repo. DB-də yalnız base=AZN məzənnələri saxlanılır (1 AZN = rate quote).
import type { DB } from '../../db.js';

export const currencyRepo = {
  listCurrencies: async (db: DB) =>
    (await db.prepare(`SELECT code, name, symbol FROM currencies ORDER BY CASE code WHEN 'AZN' THEN 0 ELSE 1 END, code`).all()) as {
      code: string;
      name: string;
      symbol: string;
    }[],

  latestDate: async (db: DB, onOrBefore?: string) =>
    (await db
            .prepare(`SELECT MAX(rate_date) FROM exchange_rates WHERE base = 'AZN' AND (@d::text IS NULL OR rate_date <= @d)`)
            .pluck()
            .get({ d: onOrBefore ?? null })) as string | null,

  ratesOn: async (db: DB, date: string) =>
    (await db.prepare(`SELECT quote, rate FROM exchange_rates WHERE base = 'AZN' AND rate_date = ?`).all(date)) as { quote: string; rate: number }[],

  lastDates: async (db: DB, days: number) =>
    (await db
            .prepare(`SELECT DISTINCT rate_date FROM exchange_rates WHERE base = 'AZN' ORDER BY rate_date DESC LIMIT ?`)
            .pluck()
            .all(days)) as string[],

  upsertRate: (db: DB, quote: string, rate: number, date: string) =>
    db
      .prepare(
        `INSERT INTO exchange_rates (base, quote, rate, rate_date) VALUES ('AZN', ?, ?, ?)
         ON CONFLICT (base, quote, rate_date) DO UPDATE SET rate = excluded.rate`,
      )
      .run(quote, rate, date),
};
