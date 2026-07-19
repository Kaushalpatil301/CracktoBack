import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { prisma } from '../../config/db';
import { redisConnection } from '../connection';
import { QUEUE_NAME_NOTIFICATIONS } from '../queues';
import { env } from '../../config/env';

// Lazily load the transporter for fallback
let testTransporter: nodemailer.Transporter | null = null;
let resend: Resend | null = null;

async function setupEmail() {
  if (env.SMTP_USER === 'resend' && env.SMTP_PASS) {
    if (!resend) {
      resend = new Resend(env.SMTP_PASS);
      console.log(`[Worker:BookingCancellation] Using Resend API`);
    }
  } else if (!testTransporter) {
    const testAccount = await nodemailer.createTestAccount();
    testTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[Worker:BookingCancellation] Using Ethereal TestMail. No SMTP credentials found.`);
  }
}

interface BookingCancellationPayload {
  bookingId: string;
  eventId: string;
  customerId: string;
  seats: number;
}

export function startBookingCancellationWorker(): Worker {
  console.log('[Worker:BookingCancellation] Started');
  setupEmail().catch(console.error);

  return new Worker(
    QUEUE_NAME_NOTIFICATIONS,
    async (job: Job<BookingCancellationPayload>) => {
      if (job.name !== 'BOOKING_CANCELLATION') return;

      const { eventId, customerId, seats } = job.data;

      const [event, customer] = await Promise.all([
        prisma.event.findUnique({ where: { id: eventId }, select: { title: true } }),
        prisma.user.findUnique({ where: { id: customerId }, select: { email: true } }),
      ]);

      if (!event || !customer) {
        throw new Error(`Data missing. Event: ${!!event}, Customer: ${!!customer}`);
      }

      console.log(`\n📧 [CANCELLATION EMAIL ATTEMPT] to ${customer.email}:`);
      
      try {
        await setupEmail();
        
        if (resend) {
          const { data, error } = await resend.emails.send({
            from: env.EMAIL_FROM || 'onboarding@resend.dev',
            to: customer.email,
            subject: `Booking Cancelled: ${event.title}`,
            text: `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully cancelled.\n\nWe hope to see you at another event soon!`,
            html: `<h3>Booking Cancelled</h3><p>Hello,</p><p>Your booking for <strong>${seats} seat(s)</strong> at <strong>'${event.title}'</strong> has been successfully cancelled.</p><p>We hope to see you at another event soon!</p>`,
          });

          if (error) {
            console.error(`❌ Resend failed to send cancellation email to ${customer.email}:`, error);
          } else {
            console.log(`✅ Cancellation email successfully dispatched to ${customer.email} via Resend. ID: ${data?.id}`);
          }
        } else if (testTransporter) {
          const info = await testTransporter.sendMail({
            from: env.EMAIL_FROM || 'onboarding@resend.dev',
            to: customer.email,
            subject: `Booking Cancelled: ${event.title}`,
            text: `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully cancelled.\n\nWe hope to see you at another event soon!`,
            html: `<h3>Booking Cancelled</h3><p>Hello,</p><p>Your booking for <strong>${seats} seat(s)</strong> at <strong>'${event.title}'</strong> has been successfully cancelled.</p><p>We hope to see you at another event soon!</p>`,
          });
          
          console.log(`✅ Cancellation email successfully dispatched to ${customer.email} via Ethereal`);
          console.log(`🔍 [TESTMAIL PREVIEW]: ${nodemailer.getTestMessageUrl(info)}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send cancellation email to ${customer.email}:`, error);
      }
    },
    { connection: redisConnection }
  );
}
