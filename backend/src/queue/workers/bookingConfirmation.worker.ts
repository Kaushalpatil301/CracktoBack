/**
 * queue/workers/bookingConfirmation.worker.ts
 *
 * Worker for BOOKING_CONFIRMATION jobs.
 * Resolves the customer email and event title from the DB, then logs the
 * simulated notification.
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '../../config/db';
import { redisConnection } from '../connection';
import { QUEUE_NAME_NOTIFICATIONS } from '../queues';

interface BookingConfirmationPayload {
  bookingId: string;
  eventId: string;
  customerId: string;
  seats: number;
}

export function startBookingConfirmationWorker(): Worker {
  console.log('[Worker:BookingConfirmation] Started');

  return new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job: Job<BookingConfirmationPayload>) => {
      // We only process BOOKING_CONFIRMATION jobs here
      if (job.name !== 'BOOKING_CONFIRMATION') return;

      const { eventId, customerId, seats } = job.data;

      // Resolve human-readable details
      const [event, customer] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId }, select: { title: true } }),
        prisma.user.findUnique({ where: { id: customerId }, select: { email: true } }),
      ]);

      if (!event || !customer) {
        throw new Error(`Data missing. Event: ${!!event}, Customer: ${!!customer}`);
      }

      // The simulated notification payload
      console.log(`\n📧 [EMAIL SENT] to ${customer.email}:`);
      console.log(`   "Your booking for ${seats} seat(s) at '${event.title}' is confirmed!"\n`);
    },
    { connection: redisConnection }
  );
}
