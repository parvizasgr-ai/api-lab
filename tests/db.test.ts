// DB qatının testləri (PostgreSQL): migration + seed + constraint-lər + trigger-lər + hazır SQL sorğuları + placeholder çevrilməsi.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { ROOT_DIR } from '../server/src/config.js';
import { convertPlaceholders, resetDatabase, userTables, tableCounts, type DB } from '../server/src/db.js';
import { createTestDb } from './setup/pg.js';

async function snapshot(db: DB): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of await userTables(db)) out[t] = await db.prepare(`SELECT * FROM "${t}" ORDER BY 1, 2`).all();
  return out;
}

// PostgreSQL xəta kodları: 23514 CHECK, 23505 UNIQUE, 23503 FOREIGN KEY
const failsWith = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toMatchObject({ code });
};

describe('placeholder çevrilməsi (? və @ad → $n)', () => {
  it('sıra ilə, adla, dırnaq və şərh daxilində toxunulmur, ::cast saxlanır', () => {
    expect(convertPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?').text).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
    const named = convertPlaceholders('UPDATE t SET a = @a, b = @b WHERE id = @id AND a <> @a');
    expect(named.text).toBe('UPDATE t SET a = $1, b = $2 WHERE id = $3 AND a <> $1');
    expect(named.names).toEqual(['a', 'b', 'id']);
    expect(convertPlaceholders(`SELECT '?', "a?", 'x@y.az' -- ?\n, ? /* @z */, $$ ? $$, x::text`).text).toBe(
      `SELECT '?', "a?", 'x@y.az' -- ?\n, $1 /* @z */, $$ ? $$, x::text`,
    );
  });
});

describe('migrations + seed', () => {
  let db: DB;
  beforeAll(() => {
    db = createTestDb();
  });

  it('bütün cədvəl, view və trigger-ləri yaradır', async () => {
    expect(await userTables(db)).toHaveLength(37);
    const views = await db.prepare(`SELECT table_name FROM information_schema.views WHERE table_schema = 'public'`).pluck().all();
    expect(views).toHaveLength(6);
    const triggers = await db.prepare(`SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE trigger_schema = 'public'`).pluck().all();
    expect(triggers).toEqual(expect.arrayContaining(['trg_cards_status_history', 'trg_transactions_audit']));
    expect(await db.prepare(`SELECT version FROM schema_migrations ORDER BY 1`).pluck().all()).toEqual(fs.readdirSync(path.join(ROOT_DIR, 'db/migrations')).filter((f) => f.endsWith('.sql')).sort());
  });

  it('seed deterministikdir: iki reset eyni datanı verir; IDENTITY sayğacları max(id)-dən davam edir', async () => {
    const other = createTestDb();
    await resetDatabase(other);
    expect(await snapshot(other)).toEqual(await snapshot(db));
    const nextCustomer = await other.prepare(`INSERT INTO customers (first_name, last_name, email) VALUES ('Yeni', 'Müştəri', 'yeni@example.az') RETURNING id`).pluck().get();
    expect(nextCustomer).toBe(26);
  });

  it('reset istifadəçi dəyişikliklərini silir', async () => {
    const t = createTestDb();
    await t.prepare(`DELETE FROM customers WHERE id = 1`).run();
    await t.prepare(`UPDATE cards SET status = 'BLOCKED', status_reason = 'STOLEN' WHERE id = 1`).run();
    await resetDatabase(t);
    const counts = Object.fromEntries((await tableCounts(t)).map((c) => [c.table, c.rows]));
    expect(counts.customers).toBe(25);
    expect(counts.card_status_history).toBe(2);
    expect(await t.prepare(`SELECT status FROM cards WHERE id = 1`).pluck().get()).toBe('ACTIVE');
  });

  it('əsas seed sayları', async () => {
    const counts = Object.fromEntries((await tableCounts(db)).map((c) => [c.table, c.rows]));
    expect(counts).toMatchObject({ users: 3, accounts: 6, cards: 7, customers: 25, books: 40, tracks: 30, hotels: 16 });
    expect(counts.flights).toBeGreaterThan(150);
    expect(counts.request_log).toBe(0);
  });

  it('balanslar əməliyyatlarla uzlaşır', async () => {
    const sql = fs.readFileSync(path.join(ROOT_DIR, 'db/queries/02_balance_reconciliation.sql'), 'utf8');
    expect(await db.prepare(sql).all()).toEqual([]);
  });

  it('reyslər gələcəkdədir, sold-out reys var, GYD→IST hər gün var', async () => {
    expect(await db.prepare(`SELECT COUNT(*) FROM flights WHERE depart_at <= iso_now()`).pluck().get()).toBe(0);
    expect(await db.prepare(`SELECT COUNT(*) FROM flights WHERE seats_left = 0`).pluck().get()).toBeGreaterThan(0);
    const days = await db.prepare(`SELECT COUNT(DISTINCT substr(depart_at, 1, 10)) FROM flights WHERE from_code='GYD' AND to_code='IST'`).pluck().get();
    expect(days).toBe(30);
  });
});

describe('constraint-lər', () => {
  let db: DB;
  beforeAll(() => {
    db = createTestDb();
  });

  it('FOREIGN KEY: mövcud olmayan hesaba kart əlavə etmək olmur', async () => {
    await failsWith(db.prepare(`INSERT INTO cards (owner_id, account_id, last4, brand, daily_limit_minor, expires_at) VALUES (1, 'XX00', '1111', 'VISA', 100, '2030-01-31')`).run(), '23503');
  });

  it('CHECK: balans mənfi ola bilməz', async () => {
    await failsWith(db.prepare(`UPDATE accounts SET balance_minor = -1 WHERE id = 'AZ21NABZ0001'`).run(), '23514');
  });

  it('CHECK: kart statusu yalnız icazəli dəyərlər', async () => {
    await failsWith(db.prepare(`UPDATE cards SET status = 'FROZEN' WHERE id = 1`).run(), '23514');
  });

  it('CHECK: check_out > check_in', async () => {
    await failsWith(
      db.prepare(`INSERT INTO hotel_bookings (room_id, user_id, check_in, check_out, guests, total_minor, currency) VALUES (1, 1, '2030-01-05', '2030-01-05', 1, 100, 'AZN')`).run(),
      '23514',
    );
  });

  it('UNIQUE: təkrar email', async () => {
    await failsWith(db.prepare(`INSERT INTO customers (first_name, last_name, email) VALUES ('A', 'B', 'nigar.aliyeva@example.az')`).run(), '23505');
  });
});

describe('transaction (AsyncLocalStorage)', () => {
  it('xəta → ROLLBACK, daxili sorğular eyni bağlantıda; .immediate ardıcıl icra olunur', async () => {
    const db = createTestDb();
    await expect(
      db.transaction(async () => {
        await db.prepare(`UPDATE accounts SET balance_minor = balance_minor + 1 WHERE id = 'AZ21NABZ0001'`).run();
        throw new Error('boom');
      })(),
    ).rejects.toThrow('boom');
    const before = await db.prepare(`SELECT balance_minor FROM accounts WHERE id = 'AZ21NABZ0001'`).pluck().get();
    const order: number[] = [];
    const slow = db.transaction(async (n: number) => {
      await db.prepare('SELECT pg_sleep(0.05)').get();
      order.push(n);
    });
    await Promise.all([slow.immediate(1), slow.immediate(2), slow.immediate(3)]);
    expect(order).toHaveLength(3);
    expect(await db.prepare(`SELECT balance_minor FROM accounts WHERE id = 'AZ21NABZ0001'`).pluck().get()).toBe(before);
  });
});

describe('trigger-lər', () => {
  it('kart statusu dəyişəndə card_status_history-ə 1 sətir yazılır', async () => {
    const db = createTestDb();
    await db.prepare(`UPDATE cards SET status = 'BLOCKED', status_reason = 'STOLEN', status_changed_by = 1, updated_at = iso_now() WHERE id = 1`).run();
    const rows = await db.prepare(`SELECT old_status, new_status, reason, changed_by FROM card_status_history WHERE card_id = 1`).all();
    expect(rows).toEqual([{ old_status: 'ACTIVE', new_status: 'BLOCKED', reason: 'STOLEN', changed_by: 1 }]);
  });

  it('yeni əməliyyat audit_log-a düşür', async () => {
    const db = createTestDb();
    const before = (await db.prepare(`SELECT COUNT(*) FROM audit_log`).pluck().get()) as number;
    await db.prepare(`INSERT INTO transactions (account_id, type, amount_minor, currency, description) VALUES ('AZ21NABZ0004', 'DEBIT', 100, 'AZN', 'test')`).run();
    expect(await db.prepare(`SELECT COUNT(*) FROM audit_log`).pluck().get()).toBe(before + 1);
    const last = await db.prepare(`SELECT user_id, action FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    expect(last).toEqual({ user_id: 3, action: 'TRANSACTION_DEBIT' });
  });
});

describe('db/queries/*.sql', () => {
  const dir = path.join(ROOT_DIR, 'db/queries');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  let db: DB;
  beforeAll(() => {
    db = createTestDb();
  });

  it('ən azı 10 hazır sorğu var', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)('%s xətasız işləyir və yalnız SELECT-dir', async (file) => {
    const statements = fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      expect(sql, file).toMatch(/^(SELECT|WITH)\b/i);
      // READ ONLY tranzaksiyada icra — yazmağa cəhd etsə xəta verər
      await db.transaction(async () => {
        await db.exec('SET TRANSACTION READ ONLY');
        await db.prepare(sql).all();
      })();
    }
  });
});
