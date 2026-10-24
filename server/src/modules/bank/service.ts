// Bank biznes qaydaları.
//   * BOLA: hər resursda sahib yoxlanılır (yoxdur → 404, başqasınındır → 403).
//   * Kart bloku: ACTIVE → BLOCKED; artıq bloklanıb → 409; STOLEN daimidir (unblock → 422).
//   * Köçürmə: BEGIN IMMEDIATE transaction — DEBIT + CREDIT + transfers sətri ya hamısı, ya heç biri (atomicity).
import type { Request } from 'express';
import type { AppContext } from '../../app.js';
import { conflict, unprocessable, forbidden } from '../../errors.js';
import { loadOwned, assertFound } from '../../lib/bola.js';
import { isoNow } from '../../lib/crypto.js';
import { fromMinor, toMinor, formatMoney } from '../../lib/money.js';
import { orderBy, offsetOf, pageOf } from '../../lib/listing.js';
import { writeAudit } from '../../lib/audit.js';
import type { AuthContext } from '../../types.js';
import { bankRepo, type AccountRow, type CardRow, type TransactionRow, type TransferRow } from './repo.js';

// ---- DB sətri → API cavabı (snake_case → camelCase, qəpik → decimal)
export const toAccount = (a: AccountRow) => ({
  id: a.id,
  type: a.type,
  currency: a.currency,
  balance: fromMinor(a.balance_minor),
  openedAt: a.opened_at,
});

export const toTransaction = (t: TransactionRow) => ({
  id: t.id,
  accountId: t.account_id,
  type: t.type,
  amount: fromMinor(t.amount_minor),
  currency: t.currency,
  description: t.description,
  transferId: t.transfer_id,
  createdAt: t.created_at,
});

export const toCard = (c: CardRow) => ({
  id: c.id,
  accountId: c.account_id,
  maskedNumber: `**** **** **** ${c.last4}`,
  last4: c.last4,
  brand: c.brand,
  status: c.status,
  statusReason: c.status_reason,
  dailyLimit: fromMinor(c.daily_limit_minor),
  currency: c.currency,
  expiresAt: c.expires_at,
});

const toTransfer = (t: TransferRow) => ({
  id: t.id,
  fromAccountId: t.from_account,
  toAccountId: t.to_account,
  amount: fromMinor(t.amount_minor),
  currency: t.currency,
  status: t.status,
  createdAt: t.created_at,
});

const ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND';
const TX_SORT = { createdAt: 'created_at', amount: 'amount_minor' };

export class BankService {
  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  private now() {
    return isoNow(this.ctx.config.now());
  }

  async listAccounts(auth: AuthContext) {
    return { items: (await bankRepo.listAccounts(this.db, auth.userId)).map(toAccount) };
  }

  async getAccount(auth: AuthContext, id: string) {
    return toAccount(loadOwned(await bankRepo.getAccount(this.db, id), auth, ACCOUNT_NOT_FOUND, 'Hesab tapılmadı'));
  }

  async listTransactions(auth: AuthContext, accountId: string, q: { from?: string; to?: string; type?: 'DEBIT' | 'CREDIT'; page: number; size: number; sort: string }) {
    loadOwned(await bankRepo.getAccount(this.db, accountId), auth, ACCOUNT_NOT_FOUND, 'Hesab tapılmadı');
    const filter = { accountId, from: q.from, to: q.to, type: q.type };
    const total = await bankRepo.countTransactions(this.db, filter);
    const rows = await bankRepo.listTransactions(this.db, filter, orderBy(q.sort, TX_SORT), q.size, offsetOf(q.page, q.size));
    return pageOf(rows.map(toTransaction), q.page, q.size, total);
  }

  async recentTransactions(auth: AuthContext, limit = 5) {
    return (await bankRepo.recentTransactions(this.db, auth.userId, limit)).map(toTransaction);
  }

  async listCards(auth: AuthContext, status?: string) {
    return { items: (await bankRepo.listCards(this.db, auth.userId, status)).map(toCard) };
  }

  async getCard(auth: AuthContext, id: number) {
    const card = loadOwned(await bankRepo.getCard(this.db, id), auth, 'CARD_NOT_FOUND', 'Kart tapılmadı');
    const statusHistory = (await bankRepo.cardHistory(this.db, id)).map((h) => ({
      oldStatus: h.old_status,
      newStatus: h.new_status,
      reason: h.reason,
      changedBy: h.changed_by,
      changedAt: h.changed_at,
    }));
    return { ...toCard(card), statusHistory };
  }

  blockCard(req: Request, cardId: number, body: { reason: 'LOST' | 'STOLEN' | 'SUSPECTED_FRAUD'; comment?: string }) {
    const auth = req.auth!;
    return this.db.transaction(async () => {
      const card = loadOwned(await bankRepo.getCard(this.db, cardId), auth, 'CARD_NOT_FOUND', 'Kart tapılmadı');
      if (card.status === 'BLOCKED') throw conflict('CARD_ALREADY_BLOCKED', 'Kart artıq bloklanıb');
      if (card.status === 'EXPIRED') throw conflict('CARD_EXPIRED', 'Kartın müddəti bitib');
      const at = this.now();
      await bankRepo.updateCardStatus(this.db, cardId, 'BLOCKED', body.reason, auth.userId, at);
      await writeAudit(this.db, req, this.ctx.config.now(), {
                action: 'CARD_BLOCKED',
                entity: 'cards',
                entityId: cardId,
                details: { reason: body.reason, comment: body.comment ?? null },
              });
      return { cardId, previousStatus: card.status, status: 'BLOCKED', reason: body.reason, comment: body.comment ?? null, changedAt: at, message: 'Kart bloklandı' };
    }).immediate();
  }

  unblockCard(req: Request, cardId: number, body: { comment?: string } = {}) {
    const auth = req.auth!;
    return this.db.transaction(async () => {
      const card = loadOwned(await bankRepo.getCard(this.db, cardId), auth, 'CARD_NOT_FOUND', 'Kart tapılmadı');
      if (card.status !== 'BLOCKED') throw conflict('CARD_NOT_BLOCKED', 'Kart bloklu deyil');
      if (card.status_reason === 'STOLEN') {
        throw unprocessable('CARD_PERMANENTLY_BLOCKED', 'Oğurlanmış kimi bloklanmış kart açıla bilməz — yeni kart sifariş edin');
      }
      const at = this.now();
      await bankRepo.updateCardStatus(this.db, cardId, 'ACTIVE', null, auth.userId, at);
      await writeAudit(this.db, req, this.ctx.config.now(), {
                action: 'CARD_UNBLOCKED',
                entity: 'cards',
                entityId: cardId,
                details: { previousReason: card.status_reason, comment: body.comment ?? null },
              });
      return { cardId, previousStatus: card.status, status: 'ACTIVE', reason: null, comment: body.comment ?? null, changedAt: at, message: 'Kart blokdan çıxarıldı' };
    }).immediate();
  }

  async createTransfer(req: Request, body: { fromAccountId: string; toAccountId: string; amount: number; currency: string }) {
    const auth = req.auth!;
    const amountMinor = toMinor(body.amount);
    if (body.fromAccountId === body.toAccountId) throw unprocessable('SAME_ACCOUNT', 'Göndərən və alan hesab eyni ola bilməz');

    // .immediate() → BEGIN IMMEDIATE: yazma kilidi transaction-ın ƏVVƏLİNDƏ alınır,
    // ona görə balans yoxlaması ilə UPDATE arasında başqa sorğu balansı dəyişə bilməz.
    // Callback daxilində istənilən xəta → ROLLBACK (heç bir balans dəyişmir).
    const transfer = await this.db.transaction(async () => {
          const from = assertFound(await bankRepo.getAccount(this.db, body.fromAccountId), ACCOUNT_NOT_FOUND, `Hesab tapılmadı: ${body.fromAccountId}`);
          if (from.owner_id !== auth.userId) throw forbidden('Yalnız öz hesabınızdan köçürmə edə bilərsiniz');
          const to = assertFound(await bankRepo.getAccount(this.db, body.toAccountId), ACCOUNT_NOT_FOUND, `Hesab tapılmadı: ${body.toAccountId}`);
          if (from.currency !== body.currency || to.currency !== body.currency) {
            throw unprocessable('CURRENCY_MISMATCH', 'Hesabların valyutası və köçürmə valyutası eyni olmalıdır', [
              { field: 'currency', message: `${from.id}: ${from.currency}, ${to.id}: ${to.currency}, sorğu: ${body.currency}` },
            ]);
          }
          if (from.balance_minor < amountMinor) {
            throw unprocessable('INSUFFICIENT_FUNDS', 'Hesabda kifayət qədər vəsait yoxdur', [
              { field: 'amount', message: `Mövcud balans: ${formatMoney(from.balance_minor, from.currency)}` },
            ]);
          }
          const at = this.now();
          const transferId = await bankRepo.insertTransfer(this.db, {
                  from_account: from.id,
                  to_account: to.id,
                  amount_minor: amountMinor,
                  currency: body.currency,
                  created_by: auth.userId,
                  created_at: at,
                });
          await bankRepo.changeBalance(this.db, from.id, -amountMinor, at);
          await bankRepo.insertTransaction(this.db, { account_id: from.id, type: 'DEBIT', amount_minor: amountMinor, currency: body.currency, description: `Köçürmə: ${to.id} hesabına`, transfer_id: transferId, created_at: at });
          await bankRepo.changeBalance(this.db, to.id, amountMinor, at);
          await bankRepo.insertTransaction(this.db, { account_id: to.id, type: 'CREDIT', amount_minor: amountMinor, currency: body.currency, description: `Köçürmə: ${from.id} hesabından`, transfer_id: transferId, created_at: at });
          return (await bankRepo.getTransfer(this.db, transferId))!;
        }).immediate();
    return toTransfer(transfer);
  }

  async getTransfer(auth: AuthContext, id: number) {
    const t = assertFound(await bankRepo.getTransfer(this.db, id), 'TRANSFER_NOT_FOUND', 'Köçürmə tapılmadı');
    let mine = false;
    for (const acc of [t.from_account, t.to_account]) if ((await bankRepo.getAccount(this.db, acc))?.owner_id === auth.userId) mine = true;
    if (!mine) throw forbidden();
    return toTransfer(t);
  }
}

