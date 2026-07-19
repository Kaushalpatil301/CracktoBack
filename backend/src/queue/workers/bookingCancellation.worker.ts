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
        
        const emailHtml = `
          <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; border-radius: 12px; background-color: #ffffff; border: 1px solid #eaeaea; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 25px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">EventBook</h1>
            </div>
            <div style="padding: 30px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #f3f4f6;">
              <h2 style="color: #ef4444; margin-top: 0; font-size: 22px; font-weight: 700;">Booking Cancelled</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hello,</p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">This email is to confirm that your booking for <strong style="color: #111827;">${seats} seat(s)</strong> at <strong style="color: #111827;">'${event.title}'</strong> has been successfully cancelled.</p>
              
              <div style="margin: 35px 0; text-align: center;">
                <span style="background-color: #f3f4f6; color: #4b5563; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Cancellation Processed</span>
              </div>
              
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 0;">We're sorry you won't be able to make it this time, but we hope to see you at another event soon!</p>
            </div>
            <div style="margin-top: 30px; text-align: center; color: #9ca3af; font-size: 13px;">
              &copy; ${new Date().getFullYear()} EventBook. All rights reserved.
            </div>
          </div>
        `;

        const emailText = `Hello!\n\nYour booking for ${seats} seat(s) at '${event.title}' has been successfully cancelled.\n\nWe hope to see you at another event soon!`;

        if (resend) {
          const { data, error } = await resend.emails.send({
            from: env.EMAIL_FROM || 'onboarding@resend.dev',
            to: customer.email,
            subject: `Booking Cancelled: ${event.title}`,
            text: emailText,
            html: emailHtml,
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
            text: emailText,
            html: emailHtml,
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
