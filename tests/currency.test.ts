// Valyuta modulu (X-API-Key).
import { describe, it, expect } from 'vitest';
import { createTestApp, expectMatchesSpec } from './helpers.js';

const KEY = { 'X-API-Key': 'apilab-demo-key-2026' };

describe('currencies', () => {
  const t = createTestApp();
  const today = t.db.prepare(`SELECT MAX(rate_date) FROM exchange_rates`).pluck().get() as string;

  it('GET /currencies — AZN birinci', async () => {
    const res = await t.api().get('/api/v1/currencies').set(KEY);
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listCurrencies');
    expect(res.body.items[0]).toEqual({ code: 'AZN', name: 'Azərbaycan manatı', symbol: '₼' });
    expect(res.body.items).toHaveLength(7);
  });

  it('GET /currencies/rates — base=AZN DB-dəki dəyərlər, base=USD çarpaz kurs', async () => {
    const azn = await t.api().get('/api/v1/currencies/rates').set(KEY);
    expect(azn.status).toBe(200);
    expectMatchesSpec(azn, 'getRates');
    expect(azn.body).toMatchObject({ base: 'AZN', date: today });
    expect(azn.body.rates.USD).toBe(0.588235);
    expect(azn.body.rates).not.toHaveProperty('AZN');

    const usd = await t.api().get('/api/v1/currencies/rates?base=USD').set(KEY);
    expect(usd.body.rates.AZN).toBeCloseTo(1.7, 4);
    expect(usd.body.rates).not.toHaveProperty('USD');
  });

  it('GET /currencies/convert — 100 USD = 170 AZN; eyni valyuta rate=1', async () => {
    const res = await t.api().get('/api/v1/currencies/convert').query({ from: 'USD', to: 'AZN', amount: 100 }).set(KEY);
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'convertCurrency');
    expect(res.body).toMatchObject({ from: 'USD', to: 'AZN', amount: 100, result: 170 });
    const same = await t.api().get('/api/v1/currencies/convert').query({ from: 'EUR', to: 'EUR', amount: 12.5 }).set(KEY);
    expect(same.body).toMatchObject({ rate: 1, result: 12.5 });
  });

  it('GET /currencies/history — son N gün, köhnədən yeniyə', async () => {
    const res = await t.api().get('/api/v1/currencies/history').query({ from: 'EUR', to: 'AZN', days: 3 }).set(KEY);
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'getRateHistory');
    expect(res.body.points).toHaveLength(3);
    expect(res.body.points[2].date).toBe(today);
    expect(res.body.points[0].date < res.body.points[1].date).toBe(true);
  });

  it('error path-lər: dəstəklənməyən valyuta 422, məlumat olmayan tarix 404, API key-siz 401, days > 30 → 422', async () => {
    const bad = await t.api().get('/api/v1/currencies/convert').query({ from: 'XYZ', to: 'AZN', amount: 1 }).set(KEY);
    expect(bad.status).toBe(422);
    expectMatchesSpec(bad, 'convertCurrency');
    const noData = await t.api().get('/api/v1/currencies/rates?date=2001-01-01').set(KEY);
    expect(noData.status).toBe(404);
    expect(noData.body.code).toBe('RATE_NOT_FOUND');
    expect((await t.api().get('/api/v1/currencies/rates')).status).toBe(401);
    expect((await t.api().get('/api/v1/currencies/history').query({ from: 'EUR', to: 'AZN', days: 31 }).set(KEY)).status).toBe(422);
  });
});
