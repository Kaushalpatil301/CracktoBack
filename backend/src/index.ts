/**
 * index.ts
 *
 * Process entrypoint. Responsibilities (in order, as each step is built):
 *   ✅ Step 2 : Start Express HTTP server.
 *   ⏳ Step 9 : Start outbox poller.
 *   ⏳ Step 10: Start BullMQ workers.
 *
 * Lifecycle:
 *  - On SIGTERM/SIGINT: stop accepting new connections, drain in-flight
 *    requests, disconnect Prisma, then exit cleanly.
 *  - env.ts is imported first so that any missing env var kills the process
 *    before we try to connect to anything.
 */

import { env } from './config/env';
import { prisma } from './config/db';
import { createApp } from './app';
import { startOutboxPoller, stopOutboxPoller } from './queue/outboxPoller';
import { startBookingConfirmationWorker } from './queue/workers/bookingConfirmation.worker';
import { startEventUpdateWorker } from './queue/workers/eventUpdateNotification.worker';
import { redisConnection } from './queue/connection';

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[Server] EventBook API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Start background processes (Steps 9 & 10 ✅)
  startOutboxPoller(1000);
  const bookingWorker = startBookingConfirmationWorker();
  const eventUpdateWorker = startEventUpdateWorker();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully`);
    
    // Stop background processes first
    stopOutboxPoller();
    await bookingWorker.close();
    await eventUpdateWorker.close();
    await redisConnection.quit();
    
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[Server] Postgres disconnected. Process exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
