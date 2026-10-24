// Bank endpoint-ləri: hesablar, kartlar, köçürmələr (hamısı Bearer tələb edir).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { BankService } from './service.js';

export function bankHandlers(ctx: AppContext): Handlers {
  const bank = new BankService(ctx);
  return {
    listAccounts: async (req, res) => res.json(await bank.listAccounts(req.auth!)),
    getAccount: async (req, res) => res.json(await bank.getAccount(req.auth!, req.valid.params.accountId)),
    listAccountTransactions: async (req, res) => res.json(await bank.listTransactions(req.auth!, req.valid.params.accountId, req.valid.query as any)),

    listCards: async (req, res) => res.json(await bank.listCards(req.auth!, req.valid.query.status)),
    getCard: async (req, res) => res.json(await bank.getCard(req.auth!, req.valid.params.cardId)),
    blockCard: async (req, res) => res.json(await bank.blockCard(req, req.valid.params.cardId, req.valid.body)),
    unblockCard: async (req, res) => res.json(await bank.unblockCard(req, req.valid.params.cardId, req.valid.body)),

    createTransfer: async (req, res) => {
      const transfer = await bank.createTransfer(req, req.valid.body);
      res.status(201).location(`/api/v1/transfers/${transfer.id}`).json(transfer);
    },
    getTransfer: async (req, res) => res.json(await bank.getTransfer(req.auth!, req.valid.params.transferId)),
  };
}
