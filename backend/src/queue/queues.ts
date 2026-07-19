/**
 * queue/queues.ts
 *
 * Defines the BullMQ queues and default job options.
 * The outbox poller pushes jobs onto these queues.
 */

import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export const QUEUE_NAME_NOTIFICATIONS = 'notifications-queue';

export const notificationsQueue = new Queue(QUEUE_NAME_NOTIFICATIONS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 2000, // 2s
    },
    removeOnComplete: true, // Keep Redis clean
    removeOnFail: 1000,     // Keep last 1000 failures for debugging
  },
});
