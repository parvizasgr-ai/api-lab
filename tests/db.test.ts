// DB qatının testləri: migration + seed + constraint-lər + trigger-lər + hazır SQL sorğuları.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { ROOT_DIR } from '../server/src/config.js';
import { openDb, resetDatabase, userTables, tableCounts, dumpSchema, type DB } from '../server/src/db.js';

function freshDb(): DB {
  const db = openDb(':memory:');
  resetDatabase(db);
  return db;
}

function snapshot(db: DB): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of userTables(db)) out[t] = db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
  return out;
}

describe('migrations + seed', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  it('bütün cədvəl, view və trigger-ləri yaradır', () => {
    expect(userTables(db)).toHaveLength(36);
    const views = db.prepare(`SELECT name FROM sqlite_master WHERE type='view'`).pluck().all();
    expect(views).toHaveLength(6);
    const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).pluck().all();
    expect(triggers).toEqual(expect.arrayContaining(['trg_cards_status_history', 'trg_transactions_audit']));
  });

  it('seed deterministikdir: iki reset eyni datanı verir', () => {
    const other = freshDb();
    expect(snapshot(other)).toEqual(snapshot(db));
  });

  it('reset istifadəçi dəyişikliklərini silir', () => {
    db.prepare(`DELETE FROM customers WHERE id = 1`).run();
    db.prepare(`UPDATE cards SET status = 'BLOCKED', status_reason = 'STOLEN' WHERE id = 1`).run();
    resetDatabase(db);
    const counts = Object.fromEntries(tableCounts(db).map((c) => [c.table, c.rows]));
    expect(counts.customers).toBe(25);
    expect(counts.card_status_history).toBe(2);
    expect(db.prepare(`SELECT status FROM cards WHERE id = 1`).pluck().get()).toBe('ACTIVE');
  });

  it('əsas seed sayları', () => {
    const counts = Object.fromEntries(tableCounts(db).map((c) => [c.table, c.rows]));
    expect(counts).toMatchObject({ users: 3, accounts: 6, cards: 7, customers: 25, books: 40, tracks: 30, hotels: 16 });
    expect(counts.flights).toBeGreaterThan(150);
    expect(counts.request_log).toBe(0);
  });

  it('balanslar əməliyyatlarla uzlaşır', () => {
    const sql = fs.readFileSync(path.join(ROOT_DIR, 'db/queries/02_balance_reconciliation.sql'), 'utf8');
    expect(db.prepare(sql).all()).toEqual([]);
  });

  it('reyslər gələcəkdədir, sold-out reys var, GYD→IST hər gün var', () => {
    const past = db.prepare(`SELECT COUNT(*) FROM flights WHERE depart_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')`).pluck().get();
    expect(past).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) FROM flights WHERE seats_left = 0`).pluck().get()).toBeGreaterThan(0);
    const days = db
      .prepare(`SELECT COUNT(DISTINCT date(depart_at)) FROM flights WHERE from_code='GYD' AND to_code='IST'`)
      .pluck()
      .get();
    expect(days).toBe(30);
  });

  it('db/schema.sql aktualdır', () => {
    const file = fs.readFileSync(path.join(ROOT_DIR, 'db/schema.sql'), 'utf8');
    expect(file).toBe(dumpSchema(db));
  });
});

describe('constraint-lər', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  it('FOREIGN KEY: mövcud olmayan hesaba kart əlavə etmək olmur', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO cards (owner_id, account_id, last4, brand, daily_limit_minor, expires_at) VALUES (1, 'XX00', '1111', 'VISA', 100, '2030-01-31')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('CHECK: balans mənfi ola bilməz', () => {
    expect(() => db.prepare(`UPDATE accounts SET balance_minor = -1 WHERE id = 'AZ21NABZ0001'`).run()).toThrow(/CHECK/);
  });

  it('CHECK: kart statusu yalnız icazəli dəyərlər', () => {
    expect(() => db.prepare(`UPDATE cards SET status = 'FROZEN' WHERE id = 1`).run()).toThrow(/CHECK/);
  });

  it('CHECK: check_out > check_in', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO hotel_bookings (room_id, user_id, check_in, check_out, guests, total_minor, currency) VALUES (1, 1, '2030-01-05', '2030-01-05', 1, 100, 'AZN')`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('UNIQUE: təkrar email', () => {
    expect(() =>
      db
        .prepare(`INSERT INTO customers (first_name, last_name, email) VALUES ('A', 'B', 'nigar.aliyeva@example.az')`)
        .run(),
    ).toThrow(/UNIQUE/);
  });
});

describe('trigger-lər', () => {
  it('kart statusu dəyişəndə card_status_history-ə 1 sətir yazılır', () => {
    const db = freshDb();
    db.prepare(
      `UPDATE cards SET status = 'BLOCKED', status_reason = 'STOLEN', status_changed_by = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = 1`,
    ).run();
    const rows = db.prepare(`SELECT old_status, new_status, reason, changed_by FROM card_status_history WHERE card_id = 1`).all();
    expect(rows).toEqual([{ old_status: 'ACTIVE', new_status: 'BLOCKED', reason: 'STOLEN', changed_by: 1 }]);
  });

  it('yeni əməliyyat audit_log-a düşür', () => {
    const db = freshDb();
    const before = db.prepare(`SELECT COUNT(*) FROM audit_log`).pluck().get() as number;
    db.prepare(
      `INSERT INTO transactions (account_id, type, amount_minor, currency, description) VALUES ('AZ21NABZ0004', 'DEBIT', 100, 'AZN', 'test')`,
    ).run();
    expect(db.prepare(`SELECT COUNT(*) FROM audit_log`).pluck().get()).toBe(before + 1);
    const last = db.prepare(`SELECT user_id, action FROM audit_log ORDER BY id DESC LIMIT 1`).get();
    expect(last).toEqual({ user_id: 3, action: 'TRANSACTION_DEBIT' });
  });
});

describe('db/queries/*.sql', () => {
  const dir = path.join(ROOT_DIR, 'db/queries');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const db = freshDb();

  it('ən azı 10 hazır sorğu var', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files)('%s xətasız işləyir və yalnız SELECT-dir', (file) => {
    const statements = fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      const stmt = db.prepare(sql);
      expect(stmt.reader).toBe(true);
      stmt.all();
    }
  });
});
