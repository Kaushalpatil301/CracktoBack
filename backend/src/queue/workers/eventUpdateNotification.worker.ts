/**
 * queue/workers/eventUpdateNotification.worker.ts
 *
 * Worker for EVENT_UPDATE_NOTIFICATION jobs.
 * Resolves the event title and finds all customers who have an active
 * (CONFIRMED) booking for this event, then logs the simulated notification
 * to all of them.
 */

import { Worker, Job } from 'bullmq';
import { prisma } from '../../config/db';
import { redisConnection } from '../connection';
import { QUEUE_NAME_NOTIFICATIONS } from '../queues';

interface EventUpdatePayload {
  eventId: string;
}

export function startEventUpdateWorker(): Worker {
  console.log('[Worker:EventUpdate] Started');

  return new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job: Job<EventUpdatePayload>) => {
      // We only process EVENT_UPDATE_NOTIFICATION jobs here
      if (job.name !== 'EVENT_UPDATE_NOTIFICATION') return;

      const { eventId } = job.data;

      // 1. Fetch event title
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { title: true },
      });

      if (!event) throw new Error('Event not found');

      // 2. Fetch all customers with CONFIRMED bookings for this event
      const bookings = await prisma.booking.findMany({
        where: {
          eventId,
          status: 'CONFIRMED',
        },
        include: {
          customer: { select: { email: true } },
        },
      });

      if (bookings.length === 0) {
        console.log(`\nℹ️ [EventUpdate] '${event.title}' was updated, but has no active bookings. Nobody to notify.\n`);
        return;
      }

      // 3. Simulate sending emails
      const emails = bookings.map((b) => b.customer.email).join(', ');
      console.log(`\n📢 [BULK EMAIL SENT] to: ${emails}`);
      console.log(`   "Heads up! The event '${event.title}' has been updated by the organizer."\n`);
    },
    { connection: redisConnection }
  );
}
