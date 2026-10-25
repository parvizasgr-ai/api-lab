// Bank endpoint-ləri: hesablar, kartlar, köçürmələr (hamısı Bearer tələb edir).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { BankService } from './service.js';
import { TOPICS } from '../../infra/index.js';

export function bankHandlers(ctx: AppContext): Handlers {
  const bank = new BankService(ctx);
  const masked = async (cardId: number) => `**** **** **** ${(await ctx.db.prepare(`SELECT last4 FROM cards WHERE id = ?`).pluck().get(cardId)) as string}`;
  return {
    listAccounts: async (req, res) => res.json(await bank.listAccounts(req.auth!)),
    getAccount: async (req, res) => res.json(await bank.getAccount(req.auth!, req.valid.params.accountId)),
    listAccountTransactions: async (req, res) => res.json(await bank.listTransactions(req.auth!, req.valid.params.accountId, req.valid.query as any)),

    listCards: async (req, res) => res.json(await bank.listCards(req.auth!, req.valid.query.status)),
    getCard: async (req, res) => res.json(await bank.getCard(req.auth!, req.valid.params.cardId)),
    // Uğurlu əməliyyat → Kafka hadisəsi (Idempotency replay-də handler işləmir → hadisə təkrarlanmır)
    blockCard: async (req, res) => {
      const result = await bank.blockCard(req, req.valid.params.cardId, req.valid.body);
      ctx.infra.publish(TOPICS.cards, 'card.blocked', req.auth!.userId, { cardId: result.cardId, maskedNumber: await masked(result.cardId), reason: result.reason, status: result.status });
      res.json(result);
    },
    unblockCard: async (req, res) => {
      const result = await bank.unblockCard(req, req.valid.params.cardId, req.valid.body);
      ctx.infra.publish(TOPICS.cards, 'card.unblocked', req.auth!.userId, { cardId: result.cardId, maskedNumber: await masked(result.cardId), status: result.status });
      res.json(result);
    },

    createTransfer: async (req, res) => {
      const transfer = await bank.createTransfer(req, req.valid.body);
      const receiver = (await ctx.db.prepare(`SELECT owner_id FROM accounts WHERE id = ?`).pluck().get(transfer.toAccountId)) as number | undefined;
      ctx.infra.publish(
        TOPICS.transfers,
        'transfer.completed',
        req.auth!.userId,
        { transferId: transfer.id, fromAccountId: transfer.fromAccountId, toAccountId: transfer.toAccountId, amount: transfer.amount, currency: transfer.currency },
        receiver ?? null,
      );
      res.status(201).location(`/api/v1/transfers/${transfer.id}`).json(transfer);
    },
    getTransfer: async (req, res) => res.json(await bank.getTransfer(req.auth!, req.valid.params.transferId)),
  };
}
