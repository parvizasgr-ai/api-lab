// Bildirişlər — Kafka consumer-i (notification-service) hadisələrdən yaradır və MongoDB-yə yazır.
// Axın: POST /cards/1/block → bank.cards topic → notification-service → notifications kolleksiyası → GET /notifications
import type { AppContext } from '../../app.js';
import type { Handlers } from '../../openapi/router.js';
import { notFound } from '../../errors.js';
import { COLLECTIONS } from '../../infra/index.js';
import type { Doc } from '../../infra/mongo.js';

export function notificationsHandlers({ infra }: AppContext): Handlers {
  return {
    listNotifications: async (req, res) => {
      const { unread, limit } = req.valid.query as { unread?: boolean; limit: number };
      const userId = req.auth!.userId;
      const filter = { userId, ...(unread ? { read: false } : {}) };
      const items = await infra.mongo.find(COLLECTIONS.notifications, filter, { sort: { createdAt: -1, _id: -1 }, limit });
      const unreadCount = await infra.mongo.countDocuments(COLLECTIONS.notifications, { userId, read: false });
      res.json({ items, unreadCount });
    },

    updateNotification: async (req, res) => {
      const id = req.valid.params.notificationId as string;
      const own = (await infra.mongo.findOne(COLLECTIONS.notifications, { _id: id, userId: req.auth!.userId })) as Doc | null;
      if (!own) throw notFound('NOTIFICATION_NOT_FOUND', 'Bildiriş tapılmadı'); // başqasının bildirişi də 404 (mövcudluğu gizlədilir)
      res.json(await infra.mongo.updateOne(COLLECTIONS.notifications, id, { read: (req.valid.body as { read: boolean }).read }));
    },
  };
}
