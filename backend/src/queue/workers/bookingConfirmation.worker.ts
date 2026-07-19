/**
 * queue/workers/bookingConfirmation.worker.ts
 *
 * Worker for BOOKING_CONFIRMATION jobs.
 * Resolves the customer email and event title from the DB, then logs the
 * simulated notification.
 */

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
      console.log(`[Worker:BookingConfirmation] Using Resend API`);
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
    console.log(`[Worker:BookingConfirmation] Using Ethereal TestMail. No SMTP credentials found.`);
  }
}

interface BookingConfirmationPayload {
  bookingId: string;
  eventId: string;
  customerId: string;
  seats: number;
}

export function startBookingConfirmationWorker(): Worker {
  console.log('[Worker:BookingConfirmation] Started');
  setupEmail().catch(console.error);

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
        await setupEmail();
        
        if (resend) {
          const { data, error } = await resend.emails.send({
            from: env.EMAIL_FROM || 'onboarding@resend.dev',
            to: customer.email,
            subject: `Booking Confirmed: ${event.title}`,
            text: `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully confirmed.\n\nEnjoy the event!`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h2 style="color: #333;">Booking Confirmed! 🎉</h2>
                </div>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello,</p>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Your booking for <strong style="color: #111;">${seats} seat(s)</strong> at <strong style="color: #111;">'${event.title}'</strong> has been successfully confirmed.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0; color: #444;"><strong>Event:</strong> ${event.title}</p>
                  <p style="margin: 5px 0 0 0; color: #444;"><strong>Seats:</strong> ${seats}</p>
                </div>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Enjoy the event!</p>
              </div>
            `,
          });

          if (error) {
            console.error(`❌ Resend failed to send confirmation email to ${customer.email}:`, error);
          } else {
            console.log(`✅ Confirmation email successfully dispatched to ${customer.email} via Resend. ID: ${data?.id}`);
          }
        } else if (testTransporter) {
          const info = await testTransporter.sendMail({
            from: env.EMAIL_FROM || 'onboarding@resend.dev',
            to: customer.email,
            subject: `Booking Confirmed: ${event.title}`,
            text: `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully confirmed.\n\nEnjoy the event!`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaec; border-radius: 8px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h2 style="color: #333;">Booking Confirmed! 🎉</h2>
                </div>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Hello,</p>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Your booking for <strong style="color: #111;">${seats} seat(s)</strong> at <strong style="color: #111;">'${event.title}'</strong> has been successfully confirmed.</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <p style="margin: 0; color: #444;"><strong>Event:</strong> ${event.title}</p>
                  <p style="margin: 5px 0 0 0; color: #444;"><strong>Seats:</strong> ${seats}</p>
                </div>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Enjoy the event!</p>
              </div>
            `,
          });
          
          console.log(`✅ Confirmation email successfully dispatched to ${customer.email} via Ethereal`);
          console.log(`🔍 [TESTMAIL PREVIEW]: ${nodemailer.getTestMessageUrl(info)}`);
        }
      } catch (error) {
        console.error(`❌ Failed to send email to ${customer.email}:`, error);
      }
    },
    { connection: redisConnection }
  );
}
