// Valyuta endpoint-ləri (X-API-Key). Dərs 1: sadə GET + query parametrləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { CurrencyService } from './service.js';

export function currencyHandlers({ db, infra, config }: AppContext): Handlers {
  const currency = new CurrencyService(db);
  return {
    listCurrencies: async (_req, res) => res.json(await currency.listCurrencies()),
    // Keş (cache-aside, Redis): ilk sorğu MISS → DB, növbəti 60 san HIT → Redis. X-Cache başlığına baxın.
    getRates: async (req, res) => {
      const { base, date } = req.valid.query;
      const key = `cache:rates:${base}:${date ?? 'latest'}`;
      const { value, hit } = await infra.redis.cached(key, config.infra.cacheTtlSec.rates, () => currency.rates(base, date));
      res.set({ 'X-Cache': hit ? 'HIT' : 'MISS', 'X-Cache-Key': key }).json(value);
    },
    convertCurrency: async (req, res) => {
      const { from, to, amount } = req.valid.query;
      res.json(await currency.convert(from, to, amount));
    },
    getRateHistory: async (req, res) => {
      const { from, to, days } = req.valid.query;
      res.json(await currency.history(from, to, days));
    },
  };
}
