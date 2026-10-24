// Valyuta endpoint-ləri (X-API-Key). Dərs 1: sadə GET + query parametrləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { CurrencyService } from './service.js';

export function currencyHandlers({ db }: AppContext): Handlers {
  const currency = new CurrencyService(db);
  return {
    listCurrencies: async (_req, res) => res.json(await currency.listCurrencies()),
    getRates: async (req, res) => res.json(await currency.rates(req.valid.query.base, req.valid.query.date)),
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
