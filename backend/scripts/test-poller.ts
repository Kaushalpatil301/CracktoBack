/**
 * scripts/test-poller.ts
 *
 * Manual verification script for Step 9.
 * 1. Inserts a raw outbox row into Postgres directly (simulating a crash between commit and poll).
 * 2. Starts the outbox poller.
 * 3. Starts a throwaway BullMQ worker.
 * 4. Confirms the job makes it from DB -> Poller -> Redis -> Worker -> DB (marked processed).
 */

import { Worker } from 'bullmq';
import { prisma } from '../src/config/db';
import { startOutboxPoller, stopOutboxPoller } from '../src/queue/outboxPoller';
import { QUEUE_NAME_NOTIFICATIONS, notificationsQueue } from '../src/queue/queues';
import { redisConnection } from '../src/queue/connection';

async function main() {
  console.log('1. Cleaning up previous DB/Redis state...');
  await prisma.outboxEvent.deleteMany();
  await notificationsQueue.obliterate({ force: true });

  console.log('2. Inserting raw unprocessed outbox row into DB...');
  const outbox = await prisma.outboxEvent.create({
    data: {
      jobType: 'EVENT_UPDATE_NOTIFICATION',
      payload: { hello: 'from_db', ts: Date.now() },
    },
  });
  console.log(`   Created DB row: ${outbox.id}`);

  console.log('3. Starting throwaway worker...');
  let jobProcessed = false;
  const worker = new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job) => {
      console.log(`\n✅ WORKER RECEIVED JOB FROM POLLER:`);
      console.log(`   Job ID (should match DB row): ${job.id}`);
      console.log(`   Type: ${job.name}`);
      console.log(`   Payload: ${JSON.stringify(job.data)}`);
      jobProcessed = true;
      return 'done';
    },
    { connection: redisConnection }
  );

  console.log('4. Starting outbox poller (1s interval)...');
  startOutboxPoller(1000);

  console.log('5. Waiting for propagation (DB -> Poller -> Redis -> Worker)...');
  
  // Wait up to 5 seconds for the worker to process it
  for (let i = 0; i < 10; i++) {
    if (jobProcessed) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!jobProcessed) {
    console.error('\n❌ FAILED: Worker never received the job.');
  } else {
    // Give DB update a split second to land
    await new Promise((r) => setTimeout(r, 200));
    const updated = await prisma.outboxEvent.findUnique({ where: { id: outbox.id } });
    if (updated?.processedAt) {
      console.log(`\n✅ DB VERIFIED: Row ${updated.id} marked processed at ${updated.processedAt.toISOString()}`);
    } else {
      console.error('\n❌ FAILED: Row was not marked processed in DB.');
    }
  }

  console.log('\n6. Cleaning up...');
  stopOutboxPoller();
  await worker.close();
  await notificationsQueue.close();
  await prisma.$disconnect();
  await redisConnection.quit();
  
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
