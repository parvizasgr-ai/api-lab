// Bank repo — hesablar, kartlar, əməliyyatlar, köçürmələr (raw SQL).
import type { DB } from '../../db.js';

export interface AccountRow {
  id: string;
  owner_id: number;
  currency: string;
  balance_minor: number;
  type: 'CURRENT' | 'SAVINGS';
  opened_at: string;
}

export interface CardRow {
  id: number;
  owner_id: number;
  account_id: string;
  last4: string;
  brand: 'VISA' | 'MASTERCARD';
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
  status_reason: 'LOST' | 'STOLEN' | 'SUSPECTED_FRAUD' | null;
  daily_limit_minor: number;
  expires_at: string;
  currency: string;
}

export interface TransactionRow {
  id: number;
  account_id: string;
  type: 'DEBIT' | 'CREDIT';
  amount_minor: number;
  currency: string;
  description: string;
  transfer_id: number | null;
  created_at: string;
}

export interface TransferRow {
  id: number;
  from_account: string;
  to_account: string;
  amount_minor: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  created_at: string;
}

export interface TransactionFilter {
  accountId: string;
  from?: string;
  to?: string;
  type?: 'DEBIT' | 'CREDIT';
}

const CARD_SELECT = `SELECT c.*, a.currency FROM cards c JOIN accounts a ON a.id = c.account_id`;

function transactionWhere(f: TransactionFilter) {
  const where = ['account_id = @accountId'];
  if (f.from) where.push('created_at >= @from');
  if (f.to) where.push(`created_at < date(@to, '+1 day')`); // "to" tarixi daxildir
  if (f.type) where.push('type = @type');
  return { sql: where.join(' AND '), params: { accountId: f.accountId, from: f.from, to: f.to, type: f.type } };
}

export const bankRepo = {
  listAccounts: (db: DB, ownerId: number) =>
    db.prepare(`SELECT * FROM accounts WHERE owner_id = ? ORDER BY id`).all(ownerId) as AccountRow[],

  getAccount: (db: DB, id: string) => db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id) as AccountRow | undefined,

  countTransactions(db: DB, f: TransactionFilter): number {
    const w = transactionWhere(f);
    return db.prepare(`SELECT COUNT(*) FROM transactions WHERE ${w.sql}`).pluck().get(w.params) as number;
  },

  listTransactions(db: DB, f: TransactionFilter, orderBy: string, limit: number, offset: number) {
    const w = transactionWhere(f);
    return db
      .prepare(`SELECT * FROM transactions WHERE ${w.sql} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
      .all({ ...w.params, limit, offset }) as TransactionRow[];
  },

  recentTransactions: (db: DB, ownerId: number, limit: number) =>
    db
      .prepare(
        `SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.owner_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
      )
      .all(ownerId, limit) as TransactionRow[],

  listCards(db: DB, ownerId: number, status?: string) {
    return db
      .prepare(`${CARD_SELECT} WHERE c.owner_id = @ownerId AND (@status IS NULL OR c.status = @status) ORDER BY c.id`)
      .all({ ownerId, status: status ?? null }) as CardRow[];
  },

  getCard: (db: DB, id: number) => db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(id) as CardRow | undefined,

  cardHistory: (db: DB, cardId: number) =>
    db
      .prepare(
        `SELECT h.old_status, h.new_status, h.reason, u.username AS changed_by, h.changed_at
         FROM card_status_history h LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.card_id = ? ORDER BY h.changed_at, h.id`,
      )
      .all(cardId) as { old_status: string; new_status: string; reason: string | null; changed_by: string | null; changed_at: string }[],

  // status_reason və status_changed_by eyni UPDATE-də yazılır → trg_cards_status_history onları NEW.*-dan oxuyur.
  updateCardStatus: (db: DB, id: number, status: string, reason: string | null, changedBy: number, at: string) =>
    db
      .prepare(`UPDATE cards SET status = ?, status_reason = ?, status_changed_by = ?, updated_at = ? WHERE id = ?`)
      .run(status, reason, changedBy, at, id),

  changeBalance: (db: DB, accountId: string, deltaMinor: number, at: string) =>
    db.prepare(`UPDATE accounts SET balance_minor = balance_minor + ?, updated_at = ? WHERE id = ?`).run(deltaMinor, at, accountId),

  insertTransfer: (db: DB, t: Omit<TransferRow, 'id' | 'status'> & { created_by: number }) =>
    Number(
      db
        .prepare(
          `INSERT INTO transfers (from_account, to_account, amount_minor, currency, status, created_by, created_at)
           VALUES (@from_account, @to_account, @amount_minor, @currency, 'COMPLETED', @created_by, @created_at)`,
        )
        .run(t).lastInsertRowid,
    ),

  insertTransaction: (db: DB, t: Omit<TransactionRow, 'id'>) =>
    db
      .prepare(
        `INSERT INTO transactions (account_id, type, amount_minor, currency, description, transfer_id, created_at)
         VALUES (@account_id, @type, @amount_minor, @currency, @description, @transfer_id, @created_at)`,
      )
      .run(t),

  getTransfer: (db: DB, id: number) => db.prepare(`SELECT * FROM transfers WHERE id = ?`).get(id) as TransferRow | undefined,
};
