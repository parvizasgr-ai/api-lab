// npm run rates:refresh — bu günün məzənnələrini real mənbədən (Frankfurter, ECB məlumatı) yeniləyir.
// ECB AZN-i dərc etmir, ona görə USD üzərindən hesablayırıq: manat dollara bağlıdır (1 USD = 1.70 AZN),
// AED də dollara bağlıdır (1 USD = 3.6725 AED). GEL ECB-də yoxdur — mövcud dəyər saxlanılır.
// Şəbəkə yoxdursa: xəbərdarlıq verilir, seed məzənnələri qalır (exit code 0).
import { openDb } from '../server/src/db.js';
import { currencyRepo } from '../server/src/modules/currency/repo.js';

const USD_AZN = 1.7;
const USD_AED = 3.6725;
const SOURCES = ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,TRY', 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,TRY'];

async function fetchUsdRates(): Promise<Record<string, number>> {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return ((await res.json()) as { rates: Record<string, number> }).rates;
    } catch {
      // növbəti mənbəni yoxla
    }
  }
  throw new Error('Məzənnə mənbəyinə qoşulmaq olmadı');
}

try {
  const usd = await fetchUsdRates();
  const today = new Date().toISOString().slice(0, 10);
  // 1 AZN = (1 / 1.70) USD; 1 AZN = (1 / 1.70) * (USD→X) X
  const azn: Record<string, number> = { USD: 1 / USD_AZN, AED: USD_AED / USD_AZN };
  for (const [code, rate] of Object.entries(usd)) azn[code] = rate / USD_AZN;
  const db = openDb();
  db.transaction(() => {
    for (const [code, rate] of Object.entries(azn)) currencyRepo.upsertRate(db, code, Number(rate.toFixed(6)), today);
    // GEL üçün dünənki dəyəri bu günə köçür (mənbədə yoxdur)
    db.prepare(
      `INSERT OR IGNORE INTO exchange_rates (base, quote, rate, rate_date)
       SELECT base, quote, rate, ? FROM exchange_rates WHERE quote = 'GEL' ORDER BY rate_date DESC LIMIT 1`,
    ).run(today);
  })();
  console.log(`Məzənnələr yeniləndi (${today}):`);
  console.table(Object.entries(azn).map(([quote, rate]) => ({ base: 'AZN', quote, rate: Number(rate.toFixed(6)), azn_per_unit: Number((1 / rate).toFixed(4)) })));
} catch (err) {
  console.warn(`⚠ ${(err as Error).message}. Seed məzənnələri istifadə olunur.`);
}
