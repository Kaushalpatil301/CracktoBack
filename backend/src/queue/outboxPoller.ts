/**
 * queue/outboxPoller.ts
 *
 * ⚠️  DURABILITY CHOKEPOINT — ai-workflow-rules.md §5 applies.
 * Any change to this file requires re-running the outbox durability test.
 *
 * Scans the OutboxEvent table for unprocessed rows and relays them to BullMQ.
 * Runs on a 1-second interval (configured via Open Questions).
 *
 * The flow is explicitly two steps (read + enqueue, then mark processed).
 * If the process crashes after enqueue but before marking processed, the job
 * will be enqueued twice. BullMQ workers must be idempotent if the payload
 * requires it (though for this app, sending a notification twice is acceptable
 * at-least-once delivery semantics).
 */

import { prisma } from '../config/db';
import { notificationsQueue } from './queues';

let isPolling = false;
let pollerTimer: NodeJS.Timeout | null = null;

export async function processOutbox() {
  // Prevent overlapping runs if DB/Redis is slow
  if (isPolling) return;
  isPolling = true;

  try {
    // 1. Fetch unprocessed events (batch of 50 to prevent memory bloat)
    const pendingEvents = await prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (pendingEvents.length === 0) {
      isPolling = false;
      return;
    }

    // 2. Enqueue to BullMQ
    // We add them in parallel to Redis
    const jobs = pendingEvents.map((evt) => ({
      name: evt.jobType,
      data: evt.payload,
      opts: {
        // Use DB row ID as BullMQ jobId to prevent double-enqueue if poller
        // crashes after enqueue but before DB update. (BullMQ ignores duplicate
        // jobId if it's already in the queue).
        jobId: evt.id,
      },
    }));

    await notificationsQueue.addBulk(jobs);

    // 3. Mark processed in DB
    const ids = pendingEvents.map((evt) => evt.id);
    await prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    console.error('[OutboxPoller] Error processing outbox:', err);
  } finally {
    isPolling = false;
  }
}

export function startOutboxPoller(intervalMs = 1000) {
  if (pollerTimer) return;
  console.log(`[OutboxPoller] Started (interval: ${intervalMs}ms)`);
  // Run immediately, then on interval
  processOutbox();
  pollerTimer = setInterval(processOutbox, intervalMs);
}

export function stopOutboxPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log('[OutboxPoller] Stopped');
  }
}
