// Callbox API v2 — Banking (10 endpoint, hamısı Bearer token tələb edir).
//   Hesablar və çıxarış, kart sifarişi / məlumatı / bloklama, depozit rəsmiləşdirmə / məlumatı / bağlama.
//   Pul yazan əməliyyatlar (depozit açma/bağlama, kart sifarişi) .immediate() tranzaksiyasındadır: balans yoxlaması
//   ilə UPDATE arasında başqa sorğu araya girə bilməz; istənilən xəta → ROLLBACK.
import crypto from 'node:crypto';
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { conflict } from '../../errors.js';
import { loadOwned } from '../../lib/bola.js';
import { writeAudit } from '../../lib/audit.js';
import { isoNow } from '../../lib/crypto.js';
import { formatMoney, toMinor } from '../../lib/money.js';
import { TOPICS } from '../../infra/index.js';
import { addDays, addMonths, daysBetween, invalid, list, money, today } from './shared.js';

// Depozit faiz cədvəli (illik, %). Sənəddə (API Reference) eyni cədvəl göstərilir.
export const DEPOSIT_RATES: Record<string, Record<number, number>> = {
  AZN: { 3: 7, 6: 8, 12: 10, 24: 11 },
  USD: { 3: 1, 6: 1.5, 12: 2.5, 24: 3 },
  EUR: { 3: 0.5, 6: 1, 12: 1.5, 24: 2 },
};
const DEPOSIT_MIN_MINOR = 10_000; // 100.00 (hər valyutada)
const MAX_ACTIVE_CARDS = 10;

interface AccountRow { id: string; owner_id: number; currency: string; balance_minor: number; type: string; opened_at: string; updated_at: string }
interface CardRow {
  id: number; owner_id: number; account_id: string; last4: string; brand: string; status: string; status_reason: string | null;
  daily_limit_minor: number; expires_at: string; created_at: string; updated_at: string; currency: string;
  card_type: string; name_on_card: string | null; delivery_method: string | null; delivery_details: string | null;
}
interface DepositRow {
  id: string; owner_id: number; source_account_id: string; currency: string; principal_minor: number; term_months: number;
  annual_rate: string | number; interest_payout: string; auto_renew: boolean; status: string; opened_at: string;
  maturity_date: string; closed_at: string | null; interest_paid_minor: number | null;
}

const CARD_SELECT = `SELECT c.*, a.currency FROM cards c JOIN accounts a ON a.id = c.account_id`;

const toAccount = (a: AccountRow) => ({
  id: a.id,
  object: 'account' as const,
  type: a.type,
  currency: a.currency,
  balance: money(a.balance_minor),
  openedAt: a.opened_at,
  updatedAt: a.updated_at,
});

const toCard = (c: CardRow, now: Date) => {
  const [year, month] = c.expires_at.split('-').map(Number);
  const status = c.status === 'ACTIVE' && c.expires_at < today(now) ? 'EXPIRED' : c.status;
  const days = daysBetween(c.created_at.slice(0, 10), today(now));
  return {
    id: c.id,
    object: 'card' as const,
    accountId: c.account_id,
    type: c.card_type,
    brand: c.brand,
    last4: c.last4,
    maskedNumber: `${c.brand === 'VISA' ? '4' : '5'}*** **** **** ${c.last4}`,
    nameOnCard: c.name_on_card,
    currency: c.currency,
    status,
    statusReason: c.status_reason,
    dailyLimit: money(c.daily_limit_minor),
    expiry: { month, year },
    delivery:
      c.card_type === 'VIRTUAL' || !c.delivery_method
        ? null
        : { method: c.delivery_method, details: c.delivery_details, status: days >= 5 ? 'DELIVERED' : 'IN_PRODUCTION', estimatedDate: addDays(c.created_at.slice(0, 10), 5) },
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
};

// Sadə faiz: principal × rate × gün / 365 (bank praktikası: ACT/365)
const interestMinor = (d: DepositRow, days: number) => Math.floor((d.principal_minor * Number(d.annual_rate) * days) / 36_500);

const toDeposit = (d: DepositRow, now: Date) => {
  const termDays = daysBetween(d.opened_at.slice(0, 10), d.maturity_date);
  const end = d.closed_at ? d.closed_at.slice(0, 10) : today(now);
  const elapsed = Math.max(0, Math.min(termDays, daysBetween(d.opened_at.slice(0, 10), end)));
  const expected = interestMinor(d, termDays);
  return {
    id: d.id,
    object: 'deposit' as const,
    status: d.status,
    currency: d.currency,
    principal: money(d.principal_minor),
    annualRate: Number(d.annual_rate),
    termMonths: d.term_months,
    interestPayout: d.interest_payout,
    autoRenew: d.auto_renew,
    sourceAccountId: d.source_account_id,
    openedAt: d.opened_at,
    maturityDate: d.maturity_date,
    daysElapsed: elapsed,
    accruedInterest: d.status === 'CLOSED' ? money(d.interest_paid_minor ?? 0) : money(interestMinor(d, elapsed)),
    expectedInterest: money(expected),
    expectedPayout: money(d.principal_minor + expected),
    closedAt: d.closed_at,
    interestPaid: d.interest_paid_minor === null ? null : money(d.interest_paid_minor),
  };
};

export function v2BankHandlers({ db, config, infra }: AppContext): Handlers {
  const now = () => config.now();
  const getCard = async (id: number) => (await db.prepare(`${CARD_SELECT} WHERE c.id = ?`).get(id)) as CardRow | undefined;
  const getAccount = async (id: string) => (await db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id)) as AccountRow | undefined;
  const getDeposit = async (id: string) => (await db.prepare(`SELECT * FROM deposits WHERE id = ?`).get(id)) as DepositRow | undefined;
  const ownAccount = async (req: Request, id: string, field: string) => {
    const account = await getAccount(id);
    // Başqasının hesabı — mövcudluğu açıqlanmır (BOLA): 404 əvəzinə 403 ümumi qaydaya uyğun loadOwned istifadə olunur
    if (!account) throw invalid('ACCOUNT_NOT_FOUND', `Hesab tapılmadı: ${id}`, field);
    return loadOwned(account, req.auth, 'ACCOUNT_NOT_FOUND', 'Hesab tapılmadı');
  };

  return {
    v2ListAccounts: async (req, res) => {
      const rows = (await db.prepare(`SELECT * FROM accounts WHERE owner_id = ? ORDER BY id`).all(req.auth!.userId)) as AccountRow[];
      res.json(list('/api/v2/accounts', rows.map(toAccount)));
    },

    v2ListAccountTransactions: async (req, res) => {
      const accountId = req.valid.params.accountId as string;
      const q = req.valid.query as { fromDate?: string; toDate?: string; type?: string; limit: number; startingAfter?: number };
      loadOwned(await getAccount(accountId), req.auth, 'ACCOUNT_NOT_FOUND', 'Hesab tapılmadı');
      if (q.fromDate && q.toDate && q.fromDate > q.toDate) throw invalid('INVALID_DATE_RANGE', 'fromDate toDate-dən böyük ola bilməz', 'fromDate');
      const rows = (await db
        .prepare(
          `SELECT * FROM transactions
           WHERE account_id = @accountId
             AND (@fromDate::text IS NULL OR created_at >= @fromDate)
             AND (@toDate::text IS NULL OR created_at < (@toDate::date + 1)::text)
             AND (@type::text IS NULL OR type = @type)
             AND (@after::int IS NULL OR id < @after)
           ORDER BY id DESC LIMIT @limit`,
        )
        .all({ accountId, fromDate: q.fromDate ?? null, toDate: q.toDate ?? null, type: q.type ?? null, after: q.startingAfter ?? null, limit: q.limit + 1 })) as {
        id: number; type: string; amount_minor: number; currency: string; description: string; transfer_id: number | null; deposit_id: string | null; created_at: string;
      }[];
      const page = rows.slice(0, q.limit);
      res.json(
        list(
          `/api/v2/accounts/${accountId}/transactions`,
          page.map((t) => ({
            id: t.id,
            object: 'transaction' as const,
            type: t.type,
            amount: money(t.amount_minor),
            currency: t.currency,
            description: t.description,
            transferId: t.transfer_id,
            depositId: t.deposit_id,
            createdAt: t.created_at,
          })),
          rows.length > q.limit,
        ),
      );
    },

    v2CreateCard: async (req, res) => {
      const b = req.valid.body as {
        accountId: string; type: 'PHYSICAL' | 'VIRTUAL'; brand: 'VISA' | 'MASTERCARD'; nameOnCard: string; dailyLimit?: number;
        delivery?: { method: 'BRANCH' | 'COURIER'; branchCode?: string; address?: string };
      };
      if (b.type === 'PHYSICAL') {
        if (!b.delivery) throw invalid('DELIVERY_REQUIRED', 'Fiziki kart üçün delivery məcburidir', 'delivery');
        if (b.delivery.method === 'BRANCH' && !b.delivery.branchCode) throw invalid('DELIVERY_REQUIRED', 'BRANCH üçün branchCode məcburidir', 'delivery.branchCode');
        if (b.delivery.method === 'COURIER' && !b.delivery.address) throw invalid('DELIVERY_REQUIRED', 'COURIER üçün address məcburidir', 'delivery.address');
      } else if (b.delivery) {
        throw invalid('DELIVERY_NOT_ALLOWED', 'Virtual kart çatdırılmır — delivery göndərməyin', 'delivery');
      }
      const id = await db.transaction(async () => {
        const account = await ownAccount(req, b.accountId, 'accountId');
        const active = (await db.prepare(`SELECT COUNT(*) FROM cards WHERE owner_id = ? AND status = 'ACTIVE'`).pluck().get(account.owner_id)) as number;
        if (active >= MAX_ACTIVE_CARDS) throw invalid('CARD_LIMIT_REACHED', `Ən çox ${MAX_ACTIVE_CARDS} aktiv kart ola bilər`, 'accountId');
        const at = isoNow(now());
        const expiresAt = addDays(addMonths(`${today(now()).slice(0, 7)}-01`, 37), -1); // 3 il sonra, ayın son günü
        const delivery = b.delivery ? (b.delivery.method === 'BRANCH' ? b.delivery.branchCode! : b.delivery.address!) : null;
        const result = await db
          .prepare(
            `INSERT INTO cards (owner_id, account_id, last4, brand, status, daily_limit_minor, expires_at, created_at, updated_at,
                                card_type, name_on_card, delivery_method, delivery_details)
             VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(account.owner_id, account.id, String(crypto.randomInt(0, 10_000)).padStart(4, '0'), b.brand, toMinor(b.dailyLimit ?? 1000), expiresAt, at, at, b.type, b.nameOnCard, b.delivery?.method ?? null, delivery);
        await writeAudit(db, req, now(), { action: 'CARD_ISSUED', entity: 'cards', entityId: result.lastInsertRowid!, details: { type: b.type, brand: b.brand } });
        return result.lastInsertRowid!;
      }).immediate();
      res.status(201).location(`/api/v2/cards/${id}`).json(toCard((await getCard(id))!, now()));
    },

    v2ListCards: async (req, res) => {
      const q = req.valid.query as { status?: string; accountId?: string };
      const rows = (await db
        .prepare(`${CARD_SELECT} WHERE c.owner_id = @owner AND (@status::text IS NULL OR c.status = @status) AND (@account::text IS NULL OR c.account_id = @account) ORDER BY c.id`)
        .all({ owner: req.auth!.userId, status: q.status ?? null, account: q.accountId ?? null })) as CardRow[];
      res.json(list('/api/v2/cards', rows.map((c) => toCard(c, now()))));
    },

    v2GetCard: async (req, res) => {
      res.json(toCard(loadOwned(await getCard(req.valid.params.cardId as number), req.auth, 'CARD_NOT_FOUND', 'Kart tapılmadı'), now()));
    },

    v2BlockCard: async (req, res) => {
      const cardId = req.valid.params.cardId as number;
      const b = req.valid.body as { reason: string; comment?: string };
      const card = await db.transaction(async () => {
        const c = loadOwned(await getCard(cardId), req.auth, 'CARD_NOT_FOUND', 'Kart tapılmadı');
        if (c.status === 'BLOCKED') throw conflict('CARD_ALREADY_BLOCKED', 'Kart artıq bloklanıb');
        if (c.status === 'EXPIRED') throw conflict('CARD_EXPIRED', 'Kartın müddəti bitib');
        const at = isoNow(now());
        await db.prepare(`UPDATE cards SET status = 'BLOCKED', status_reason = ?, status_changed_by = ?, updated_at = ? WHERE id = ?`).run(b.reason, req.auth!.userId, at, cardId);
        await writeAudit(db, req, now(), { action: 'CARD_BLOCKED', entity: 'cards', entityId: cardId, details: { reason: b.reason, comment: b.comment ?? null } });
        return (await getCard(cardId))!;
      }).immediate();
      infra.publish(TOPICS.cards, 'card.blocked', req.auth!.userId, { cardId, maskedNumber: `**** ${card.last4}`, reason: b.reason, status: 'BLOCKED' });
      res.json(toCard(card, now()));
    },

    v2CreateDeposit: async (req, res) => {
      const b = req.valid.body as { sourceAccountId: string; amount: number; termMonths: 3 | 6 | 12 | 24; interestPayout?: 'MONTHLY' | 'AT_MATURITY'; autoRenew?: boolean };
      const amountMinor = toMinor(b.amount);
      const id = await db.transaction(async () => {
        const account = await ownAccount(req, b.sourceAccountId, 'sourceAccountId');
        const rate = DEPOSIT_RATES[account.currency]?.[b.termMonths];
        if (rate === undefined) {
          throw invalid('DEPOSIT_CURRENCY_NOT_SUPPORTED', `${account.currency} valyutasında depozit açılmır (yalnız ${Object.keys(DEPOSIT_RATES).join(', ')})`, 'sourceAccountId');
        }
        if (amountMinor < DEPOSIT_MIN_MINOR) throw invalid('AMOUNT_TOO_SMALL', `Minimum depozit məbləği: ${formatMoney(DEPOSIT_MIN_MINOR, account.currency)}`, 'amount');
        if (account.balance_minor < amountMinor) {
          throw invalid('INSUFFICIENT_FUNDS', 'Hesabda kifayət qədər vəsait yoxdur', 'amount', `Mövcud balans: ${formatMoney(account.balance_minor, account.currency)}`);
        }
        const at = isoNow(now());
        const depositId = `dep_${crypto.randomBytes(6).toString('hex')}`;
        await db
          .prepare(
            `INSERT INTO deposits (id, owner_id, source_account_id, currency, principal_minor, term_months, annual_rate, interest_payout, auto_renew, status, opened_at, maturity_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
          )
          .run(depositId, account.owner_id, account.id, account.currency, amountMinor, b.termMonths, rate, b.interestPayout ?? 'AT_MATURITY', b.autoRenew ?? false, at, addMonths(today(now()), b.termMonths));
        await db.prepare(`UPDATE accounts SET balance_minor = balance_minor - ?, updated_at = ? WHERE id = ?`).run(amountMinor, at, account.id);
        await db
          .prepare(`INSERT INTO transactions (account_id, type, amount_minor, currency, description, deposit_id, created_at) VALUES (?, 'DEBIT', ?, ?, ?, ?, ?)`)
          .run(account.id, amountMinor, account.currency, `Depozit açılışı: ${depositId} (${b.termMonths} ay, ${rate}%)`, depositId, at);
        await writeAudit(db, req, now(), { action: 'DEPOSIT_OPENED', entity: 'deposits', entityId: depositId, details: { amount: b.amount, termMonths: b.termMonths, rate } });
        return depositId;
      }).immediate();
      res.status(201).location(`/api/v2/deposits/${id}`).json(toDeposit((await getDeposit(id))!, now()));
    },

    v2ListDeposits: async (req, res) => {
      const q = req.valid.query as { status?: string };
      const rows = (await db
        .prepare(`SELECT * FROM deposits WHERE owner_id = @owner AND (@status::text IS NULL OR status = @status) ORDER BY opened_at DESC, id`)
        .all({ owner: req.auth!.userId, status: q.status ?? null })) as DepositRow[];
      res.json(list('/api/v2/deposits', rows.map((d) => toDeposit(d, now()))));
    },

    v2GetDeposit: async (req, res) => {
      res.json(toDeposit(loadOwned(await getDeposit(req.valid.params.depositId as string), req.auth, 'DEPOSIT_NOT_FOUND', 'Depozit tapılmadı'), now()));
    },

    // Vaxtından əvvəl bağlama: yalnız əsas məbləğ qaytarılır (faiz ödənilmir). Müddət bitibsə: əsas + tam faiz.
    v2CloseDeposit: async (req, res) => {
      const depositId = req.valid.params.depositId as string;
      await db.transaction(async () => {
        const d = loadOwned(await getDeposit(depositId), req.auth, 'DEPOSIT_NOT_FOUND', 'Depozit tapılmadı');
        if (d.status === 'CLOSED') throw conflict('DEPOSIT_ALREADY_CLOSED', 'Depozit artıq bağlanıb');
        const at = isoNow(now());
        const matured = today(now()) >= d.maturity_date;
        const interest = matured ? interestMinor(d, daysBetween(d.opened_at.slice(0, 10), d.maturity_date)) : 0;
        const payout = d.principal_minor + interest;
        await db.prepare(`UPDATE deposits SET status = 'CLOSED', closed_at = ?, interest_paid_minor = ? WHERE id = ?`).run(at, interest, d.id);
        await db.prepare(`UPDATE accounts SET balance_minor = balance_minor + ?, updated_at = ? WHERE id = ?`).run(payout, at, d.source_account_id);
        await db
          .prepare(`INSERT INTO transactions (account_id, type, amount_minor, currency, description, deposit_id, created_at) VALUES (?, 'CREDIT', ?, ?, ?, ?, ?)`)
          .run(d.source_account_id, payout, d.currency, `Depozit bağlanışı: ${d.id}${matured ? '' : ' (vaxtından əvvəl, faizsiz)'}`, d.id, at);
        await writeAudit(db, req, now(), { action: 'DEPOSIT_CLOSED', entity: 'deposits', entityId: d.id, details: { early: !matured, interest: interest / 100 } });
      }).immediate();
      const d = (await getDeposit(depositId))!;
      res.json({ ...toDeposit(d, now()), earlyClosure: (d.closed_at ?? '').slice(0, 10) < d.maturity_date });
    },
  };
}
