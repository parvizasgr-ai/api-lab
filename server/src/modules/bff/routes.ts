// BFF (Backend-for-Frontend): UI-ın bir ekranı üçün lazım olan datanı BİR sorğuda yığır.
// Mövcud service-ləri birbaşa çağırır (HTTP yox), paralel (Promise.all), hər çağırışı meta.calls-da göstərir.
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { ApiError } from '../../errors.js';
import { BankService } from '../bank/service.js';
import { CurrencyService } from '../currency/service.js';
import { FlightsService } from '../flights/service.js';
import { HotelsService } from '../hotels/service.js';
import { MusicService } from '../music/service.js';
import { meta, runCall, type CallResult } from './calls.js';

const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

export function bffHandlers(ctx: AppContext): Handlers {
  const bank = new BankService(ctx);
  const currency = new CurrencyService(ctx.db);
  const flights = new FlightsService(ctx);
  const hotels = new HotelsService(ctx);
  const music = new MusicService(ctx);
  const { config } = ctx;

  // Dashboard-da hissəvi cavab yoxdur: hər hansı bölmə uğursuz olarsa, onun xətası bütün cavabın xətasıdır.
  const unwrap = <T>(r: CallResult<T>): T => {
    if (r.ok) return r.data;
    const e = r.error;
    throw new ApiError(e.status, e.code, e.message, e.details);
  };

  return {
    bffDashboard: async (req, res) => {
      const auth = req.auth!;
      const started = performance.now();
      const results = await Promise.all([
        runCall(req, config, 'accounts.list', () => bank.listAccounts(auth).items),
        runCall(req, config, 'cards.list', () => bank.listCards(auth).items),
        runCall(req, config, 'transactions.recent', () => bank.recentTransactions(auth, 5)),
        runCall(req, config, 'currencies.rates', () => {
          const r = currency.rates('AZN');
          return { ...r, rates: { USD: r.rates.USD, EUR: r.rates.EUR } };
        }),
      ]);
      const [accounts, cards, recentTransactions, rates] = results;
      const profile = ctx.auth.profile(auth.userId);
      res.json({
        user: { id: profile.id, username: profile.username, fullName: profile.fullName },
        accounts: unwrap(accounts),
        cards: unwrap(cards),
        recentTransactions: unwrap(recentTransactions),
        rates: unwrap(rates),
        meta: meta(started, results),
      });
    },

    bffTravelSearch: async (req, res) => {
      const q = req.valid.query as { from: string; to: string; date: string; city?: string; nights: number; adults: number };
      const started = performance.now();
      const results = await Promise.all([
        runCall(req, config, 'flights.search', () => {
          const page = flights.search({ from: q.from, to: q.to, date: q.date, adults: q.adults, sort: 'price', page: 1, size: 10 });
          return { items: page.items, total: page.total };
        }),
        runCall(req, config, 'hotels.search', () => {
          const city = q.city ?? flights.airports(q.to).items.find((a) => a.code === q.to)?.city;
          if (!city) throw new ApiError(404, 'NOT_FOUND', `Hava limanı tapılmadı: ${q.to}`);
          const page = hotels.search({ city, checkIn: q.date, checkOut: addDays(q.date, q.nights), guests: q.adults, sort: 'price', page: 1, size: 10 });
          return { items: page.items, total: page.total };
        }),
      ]);
      const section = (r: CallResult<unknown>) => (r.ok ? { status: 200, data: r.data } : { status: r.status, error: r.error });
      const m = meta(started, results);
      res.status(m.partial ? 207 : 200).json({ flights: section(results[0]), hotels: section(results[1]), meta: m });
    },

    bffMusicHome: async (req, res) => {
      const started = performance.now();
      const results = await Promise.all([
        runCall(req, config, 'music.popular', () => music.popular(10)),
        runCall(req, config, 'music.playlists', () => music.playlists(req.auth!).items),
      ]);
      res.json({ popular: unwrap(results[0]), playlists: unwrap(results[1]), meta: meta(started, results) });
    },
  };
}
