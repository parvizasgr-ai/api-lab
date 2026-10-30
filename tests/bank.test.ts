// Bank modulu: hesablar, əməliyyatlar, kartlar (blok/unblock), köçürmə atomikliyi.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { ROOT_DIR } from '../server/src/config.js';
import { createTestApp, expectMatchesSpec, bearer } from './helpers.js';

type T = ReturnType<typeof createTestApp>;

async function setup() {
  const t = createTestApp();
  const student = (await t.login('student')).access_token;
  const rauf = (await t.login('rauf')).access_token;
  return { ...t, student, rauf };
}

const balance = async (t: T, id: string) => (await t.db.prepare(`SELECT balance_minor FROM accounts WHERE id = ?`).pluck().get(id)) as number;
const historyCount = async (t: T, cardId: number) =>
  (await t.db.prepare(`SELECT COUNT(*) FROM card_status_history WHERE card_id = ?`).pluck().get(cardId)) as number;

describe('accounts', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it('GET /accounts — yalnız öz hesablarım', async () => {
    const res = await t.api().get('/api/v1/accounts').set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listAccounts');
    expect(res.body.items.map((a: { id: string }) => a.id)).toEqual(['AZ21NABZ0001', 'AZ21NABZ0002', 'AZ21NABZ0003']);
    expect(res.body.items[0].balance).toBe(3981.9); // 4481.90 − 500.00 seed depoziti (dep_5f2a9c1e7b30)
  });

  it('GET /accounts/{id} — başqasının hesabı 403, olmayan 404, səhv format 422', async () => {
    expect((await t.api().get('/api/v1/accounts/AZ21NABZ0001').set(bearer(t.student))).status).toBe(200);
    const other = await t.api().get('/api/v1/accounts/AZ21NABZ0004').set(bearer(t.student));
    expect(other.status).toBe(403);
    expectMatchesSpec(other, 'getAccount');
    const missing = await t.api().get('/api/v1/accounts/AZ21NABZ9999').set(bearer(t.student));
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('ACCOUNT_NOT_FOUND');
    expect((await t.api().get('/api/v1/accounts/123').set(bearer(t.student))).status).toBe(422);
  });

  it('GET /accounts/{id}/transactions — filter, sort, pagination', async () => {
    const res = await t.api().get('/api/v1/accounts/AZ21NABZ0001/transactions').query({ type: 'CREDIT', size: 2, sort: '-amount' }).set(bearer(t.student));
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'listAccountTransactions');
    expect(res.body).toMatchObject({ page: 1, size: 2, total: 3, totalPages: 2 });
    expect(res.body.items.every((x: { type: string }) => x.type === 'CREDIT')).toBe(true);
    expect(res.body.items[0].amount).toBe(2200);

    const page2 = await t.api().get('/api/v1/accounts/AZ21NABZ0001/transactions').query({ type: 'CREDIT', size: 2, page: 2, sort: '-amount' }).set(bearer(t.student));
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].amount).toBe(1500);
  });

  it('transactions: səhv sort dəyəri 422, başqasının hesabı 403', async () => {
    expect((await t.api().get('/api/v1/accounts/AZ21NABZ0001/transactions?sort=balance').set(bearer(t.student))).status).toBe(422);
    expect((await t.api().get('/api/v1/accounts/AZ21NABZ0004/transactions').set(bearer(t.student))).status).toBe(403);
  });
});

describe('cards — blok/unblock', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  it('GET /cards və /cards/{id} (status tarixçəsi ilə)', async () => {
    const list = await t.api().get('/api/v1/cards').set(bearer(t.student));
    expect(list.status).toBe(200);
    expectMatchesSpec(list, 'listCards');
    expect(list.body.items.map((c: { id: number }) => c.id)).toEqual([1, 2, 3, 4]);
    const blocked = await t.api().get('/api/v1/cards?status=BLOCKED').set(bearer(t.student));
    expect(blocked.body.items.map((c: { id: number }) => c.id)).toEqual([3]);

    const card = await t.api().get('/api/v1/cards/3').set(bearer(t.student));
    expectMatchesSpec(card, 'getCard');
    expect(card.body.statusHistory).toEqual([
      expect.objectContaining({ oldStatus: 'ACTIVE', newStatus: 'BLOCKED', reason: 'LOST', changedBy: 'student' }),
    ]);
  });

  it('blok: 200, card_status_history-də 1 yeni sətir, ikinci dəfə 409', async () => {
    const before = await historyCount(t, 1);
    const res = await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST', comment: 'Metroda itirdim' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'blockCard');
    expect(res.body).toMatchObject({ cardId: 1, previousStatus: 'ACTIVE', status: 'BLOCKED', reason: 'LOST' });
    expect(await historyCount(t, 1)).toBe(before + 1);
    const row = await t.db.prepare(`SELECT old_status, new_status, reason, changed_by FROM card_status_history WHERE card_id = 1`).get();
    expect(row).toEqual({ old_status: 'ACTIVE', new_status: 'BLOCKED', reason: 'LOST', changed_by: 1 });
    const audit = (await t.db.prepare(`SELECT details FROM audit_log WHERE action = 'CARD_BLOCKED'`).pluck().get()) as string;
    expect(JSON.parse(audit)).toEqual({ reason: 'LOST', comment: 'Metroda itirdim' });

    const again = await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'LOST' });
    expect(again.status).toBe(409);
    expectMatchesSpec(again, 'blockCard');
    expect(again.body.code).toBe('CARD_ALREADY_BLOCKED');
    expect(await historyCount(t, 1)).toBe(before + 1);
  });

  it('blok: səhv reason 422, başqasının kartı 403, tokensiz 401, olmayan 404, müddəti bitmiş 409', async () => {
    const invalid = await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'BROKEN' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('INVALID_REASON');

    const others = await t.api().post('/api/v1/cards/5/block').set(bearer(t.student)).send({ reason: 'LOST' });
    expect(others.status).toBe(403);
    expect(others.body.code).toBe('FORBIDDEN');

    const anonymous = await t.api().post('/api/v1/cards/1/block').send({ reason: 'LOST' });
    expect(anonymous.status).toBe(401);

    const missing = await t.api().post('/api/v1/cards/999/block').set(bearer(t.student)).send({ reason: 'LOST' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CARD_NOT_FOUND');

    const expired = await t.api().post('/api/v1/cards/4/block').set(bearer(t.student)).send({ reason: 'LOST' });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('CARD_EXPIRED');

    // Heç biri DB-ni dəyişməyib
    expect(await t.db.prepare(`SELECT status FROM cards WHERE id IN (1, 5) ORDER BY id`).pluck().all()).toEqual(['ACTIVE', 'ACTIVE']);
  });

  it('blok + eyni Idempotency-Key: replay (200, eyni cavab), 409 deyil; tarixçədə yenə 1 sətir', async () => {
    const send = () => t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).set('Idempotency-Key', 'block-1-lesson3').send({ reason: 'SUSPECTED_FRAUD' });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await historyCount(t, 1)).toBe(1);
  });

  it('unblock: LOST → 200 ACTIVE; STOLEN → 422; aktiv kart → 409', async () => {
    const res = await t.api().post('/api/v1/cards/3/unblock').set(bearer(t.student)).send({ comment: 'Tapdım' });
    expect(res.status).toBe(200);
    expectMatchesSpec(res, 'unblockCard');
    expect(res.body).toMatchObject({ previousStatus: 'BLOCKED', status: 'ACTIVE' });
    expect(await t.db.prepare(`SELECT status, status_reason FROM cards WHERE id = 3`).get()).toEqual({ status: 'ACTIVE', status_reason: null });

    // body opsionaldır
    expect((await t.api().post('/api/v1/cards/1/unblock').set(bearer(t.student))).status).toBe(409);

    await t.api().post('/api/v1/cards/1/block').set(bearer(t.student)).send({ reason: 'STOLEN' });
    const stolen = await t.api().post('/api/v1/cards/1/unblock').set(bearer(t.student));
    expect(stolen.status).toBe(422);
    expect(stolen.body.code).toBe('CARD_PERMANENTLY_BLOCKED');
  });
});

describe('transfers', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    t = await setup();
  });

  const body = { fromAccountId: 'AZ21NABZ0001', toAccountId: 'AZ21NABZ0004', amount: 25.5, currency: 'AZN' };
  const transfer = (token: string, key: string, data: object = body) =>
    t.api().post('/api/v1/transfers').set(bearer(token)).set('Idempotency-Key', key).send(data);

  it('201 + Location; balanslar dəyişir; 2 əməliyyat sətri; GET /transfers/{id}', async () => {
    const from = await balance(t, 'AZ21NABZ0001');
    const to = await balance(t, 'AZ21NABZ0004');
    const res = await transfer(t.student, 'transfer-happy-01');
    expect(res.status).toBe(201);
    expectMatchesSpec(res, 'createTransfer');
    expect(res.headers.location).toBe(`/api/v1/transfers/${res.body.id}`);
    expect(res.body).toMatchObject({ amount: 25.5, currency: 'AZN', status: 'COMPLETED' });
    expect(await balance(t, 'AZ21NABZ0001')).toBe(from - 2550);
    expect(await balance(t, 'AZ21NABZ0004')).toBe(to + 2550);
    const legs = await t.db.prepare(`SELECT account_id, type, amount_minor FROM transactions WHERE transfer_id = ? ORDER BY id`).all(res.body.id);
    expect(legs).toEqual([
      { account_id: 'AZ21NABZ0001', type: 'DEBIT', amount_minor: 2550 },
      { account_id: 'AZ21NABZ0004', type: 'CREDIT', amount_minor: 2550 },
    ]);

    const get = await t.api().get(res.headers.location).set(bearer(t.student));
    expect(get.status).toBe(200);
    expectMatchesSpec(get, 'getTransfer');
    // Alan tərəf (rauf) da görə bilir, admin isə yox (BOLA)
    expect((await t.api().get(res.headers.location).set(bearer(t.rauf))).status).toBe(200);
    const admin = (await t.login('admin')).access_token;
    expect((await t.api().get(res.headers.location).set(bearer(admin))).status).toBe(403);
  });

  it('eyni Idempotency-Key ikinci dəfə pul çıxarmır', async () => {
    const from = await balance(t, 'AZ21NABZ0001');
    const first = await transfer(t.student, 'transfer-retry-01');
    const second = await transfer(t.student, 'transfer-retry-01');
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    expect(await balance(t, 'AZ21NABZ0001')).toBe(from - 2550);
    expect(await t.db.prepare(`SELECT COUNT(*) FROM transfers`).pluck().get()).toBe(2); // seed 1 + yeni 1
  });

  it.each([
    ['INSUFFICIENT_FUNDS', { ...body, amount: 999999 }],
    ['CURRENCY_MISMATCH', { ...body, fromAccountId: 'AZ21NABZ0002', currency: 'USD' }],
    ['SAME_ACCOUNT', { ...body, toAccountId: 'AZ21NABZ0001' }],
  ])('422 %s — heç bir balans dəyişmir', async (code, data) => {
    const snapshot = await t.db.prepare(`SELECT id, balance_minor FROM accounts ORDER BY id`).all();
    const res = await transfer(t.student, `transfer-${code}`, data);
    expect(res.status).toBe(422);
    expectMatchesSpec(res, 'createTransfer');
    expect(res.body.code).toBe(code);
    expect(await t.db.prepare(`SELECT id, balance_minor FROM accounts ORDER BY id`).all()).toEqual(snapshot);
  });

  it('başqasının hesabından → 403, olmayan hesaba → 404', async () => {
    const others = await transfer(t.student, 'transfer-bola-01', { ...body, fromAccountId: 'AZ21NABZ0004', toAccountId: 'AZ21NABZ0001' });
    expect(others.status).toBe(403);
    const missing = await transfer(t.student, 'transfer-404-01', { ...body, toAccountId: 'AZ21NABZ9999' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('ATOMİKLİK: DEBIT yazıldıqdan sonra CREDIT uğursuz olarsa — ROLLBACK, heç nə dəyişmir', async () => {
    // CREDIT sətrinin yazılmasını DB səviyyəsində "sındırırıq" (DEBIT və balans dəyişikliyi artıq icra olunub)
    await t.db.exec(`CREATE FUNCTION test_break_credit() RETURNS trigger LANGUAGE plpgsql AS $$
                       BEGIN RAISE EXCEPTION 'simulated failure'; END $$;
                     CREATE TRIGGER test_break_credit BEFORE INSERT ON transactions
                       FOR EACH ROW WHEN (NEW.type = 'CREDIT') EXECUTE FUNCTION test_break_credit();`);
    const snapshot = await t.db.prepare(`SELECT id, balance_minor FROM accounts ORDER BY id`).all();
    const counts = () => t.db.prepare(`SELECT (SELECT COUNT(*) FROM transfers) || '/' || (SELECT COUNT(*) FROM transactions)`).pluck().get();
    const before = await counts();

    const original = console.error;
    console.error = () => {};
    const res = await transfer(t.student, 'transfer-atomic-01');
    console.error = original;

    expect(res.status).toBe(500);
    expect(await t.db.prepare(`SELECT id, balance_minor FROM accounts ORDER BY id`).all()).toEqual(snapshot);
    expect(await counts()).toBe(before);
    expect(await t.db.prepare(`SELECT COUNT(*) FROM idempotency_keys`).pluck().get()).toBe(0); // xəta saxlanmır
  });

  it('bir neçə köçürmədən sonra balans uzlaşması pozulmur (db/queries/02)', async () => {
    await transfer(t.student, 'transfer-recon-01');
    await transfer(t.rauf, 'transfer-recon-02', { fromAccountId: 'AZ21NABZ0004', toAccountId: 'AZ21NABZ0001', amount: 10, currency: 'AZN' });
    const sql = fs.readFileSync(path.join(ROOT_DIR, 'db/queries/02_balance_reconciliation.sql'), 'utf8');
    expect(await t.db.prepare(sql).all()).toEqual([]);
  });
});
