/**
 * scripts/test-queue.ts
 *
 * Manual verification script for Step 8:
 * Confirms a single job round-trips through Redis before we build the
 * outbox poller.
 */

import { Worker } from 'bullmq';
import { notificationsQueue, QUEUE_NAME_NOTIFICATIONS } from '../src/queue/queues';
import { redisConnection } from '../src/queue/connection';

async function main() {
  console.log('1. Starting throwaway worker...');
  
  const worker = new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job) => {
      console.log(`\n✅ WORKER RECEIVED JOB [${job.id}]:`);
      console.log(`   Type: ${job.name}`);
      console.log(`   Payload: ${JSON.stringify(job.data)}`);
      return 'done';
    },
    { connection: redisConnection }
  );

  worker.on('completed', (job) => {
    console.log(`✅ WORKER COMPLETED JOB [${job.id}]`);
  });

  worker.on('failed', (job, err) => {
    console.log(`❌ WORKER FAILED JOB [${job?.id}]: ${err.message}`);
  });

  console.log('2. Pushing test job to queue...');
  const job = await notificationsQueue.add('TEST_JOB', { hello: 'world', ts: Date.now() });
  console.log(`   Job ${job.id} enqueued.`);

  // Wait 2 seconds for worker to process it
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('\n3. Cleaning up...');
  await worker.close();
  await notificationsQueue.close();
  await redisConnection.quit();
  
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
