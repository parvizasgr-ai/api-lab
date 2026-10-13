// Bank endpoint-ləri: hesablar, kartlar, köçürmələr (hamısı Bearer tələb edir).
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { BankService } from './service.js';

export function bankHandlers(ctx: AppContext): Handlers {
  const bank = new BankService(ctx);
  return {
    listAccounts: (req, res) => res.json(bank.listAccounts(req.auth!)),
    getAccount: (req, res) => res.json(bank.getAccount(req.auth!, req.valid.params.accountId)),
    listAccountTransactions: (req, res) => res.json(bank.listTransactions(req.auth!, req.valid.params.accountId, req.valid.query as any)),

    listCards: (req, res) => res.json(bank.listCards(req.auth!, req.valid.query.status)),
    getCard: (req, res) => res.json(bank.getCard(req.auth!, req.valid.params.cardId)),
    blockCard: (req, res) => res.json(bank.blockCard(req, req.valid.params.cardId, req.valid.body)),
    unblockCard: (req, res) => res.json(bank.unblockCard(req, req.valid.params.cardId, req.valid.body)),

    createTransfer: (req, res) => {
      const transfer = bank.createTransfer(req, req.valid.body);
      res.status(201).location(`/api/v1/transfers/${transfer.id}`).json(transfer);
    },
    getTransfer: (req, res) => res.json(bank.getTransfer(req.auth!, req.valid.params.transferId)),
  };
}
