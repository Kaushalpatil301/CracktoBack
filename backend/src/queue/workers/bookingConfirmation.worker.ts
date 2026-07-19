/**
 * queue/workers/bookingConfirmation.worker.ts
 *
 * Worker for BOOKING_CONFIRMATION jobs.
 * Resolves the customer email and event title from the DB, then logs the
 * simulated notification.
 */

import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '../../config/db';
import { redisConnection } from '../connection';
import { QUEUE_NAME_NOTIFICATIONS } from '../queues';
import { env } from '../../config/env';

// Lazily load the transporter
let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.sendgrid.net',
      port: env.SMTP_PORT || 587,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    console.log(`[Worker:BookingConfirmation] Using production SMTP (${env.SMTP_HOST})`);
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[Worker:BookingConfirmation] Using Ethereal TestMail. No SMTP credentials found.`);
  }

  return transporter;
}

interface BookingConfirmationPayload {
  bookingId: string;
  eventId: string;
  customerId: string;
  seats: number;
}

export function startBookingConfirmationWorker(): Worker {
  console.log('[Worker:BookingConfirmation] Started');
  // Pre-initialize transporter in the background so it's ready
  getTransporter().catch(console.error);

  return new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job: Job<BookingConfirmationPayload>) => {
      if (job.name !== 'BOOKING_CONFIRMATION') return;

      const { eventId, customerId, seats } = job.data;

      const [event, customer] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId }, select: { title: true } }),
        prisma.user.findUnique({ where: { id: customerId }, select: { email: true } }),
      ]);

      if (!event || !customer) {
        throw new Error(`Data missing. Event: ${!!event}, Customer: ${!!customer}`);
      }

      console.log(`\n📧 [EMAIL ATTEMPT] to ${customer.email}:`);
      
      try {
        const mailTransporter = await getTransporter();
        const info = await mailTransporter.sendMail({
          from: env.EMAIL_FROM,
          to: customer.email,
          subject: `Booking Confirmed: ${event.title}`,
          text: `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully confirmed.\n\nEnjoy the event!`,
          html: `<h3>Booking Confirmed!</h3><p>Hello,</p><p>Your booking for <strong>${seats} seat(s)</strong> at <strong>'${event.title}'</strong> has been successfully confirmed.</p><p>Enjoy the event!</p>`,
        });
        
        console.log(`✅ Email successfully dispatched to ${customer.email}`);
        
        // If we are using Ethereal testmail, print the preview URL
        if (!env.SMTP_USER) {
          console.log(`🔍 [TESTMAIL PREVIEW]: ${nodemailer.getTestMessageUrl(info)}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send email to ${customer.email}:`, error);
      }
    },
    { connection: redisConnection }
  );
}
