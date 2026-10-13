// Valyuta endpoint-ləri (X-API-Key). Dərs 1: sadə GET + query parametrləri.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { CurrencyService } from './service.js';

export function currencyHandlers({ db }: AppContext): Handlers {
  const currency = new CurrencyService(db);
  return {
    listCurrencies: (_req, res) => res.json(currency.listCurrencies()),
    getRates: (req, res) => res.json(currency.rates(req.valid.query.base, req.valid.query.date)),
    convertCurrency: (req, res) => {
      const { from, to, amount } = req.valid.query;
      res.json(currency.convert(from, to, amount));
    },
    getRateHistory: (req, res) => {
      const { from, to, days } = req.valid.query;
      res.json(currency.history(from, to, days));
    },
  };
}
