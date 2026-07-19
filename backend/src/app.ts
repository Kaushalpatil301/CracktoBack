/**
 * app.ts
 *
 * Express application factory.
 * Exports `createApp()` so that tests can spin up a fresh app instance
 * without binding to a port. src/index.ts calls createApp() and then
 * app.listen().
 *
 * Middleware order (must not be changed):
 *  1. express.json()      — body parsing
 *  2. Routes              — business routes + health
 *  3. 404 handler         — unknown routes
 *  4. errorHandler        — converts thrown errors to JSON responses
 */

import express, { NextFunction, Request, Response } from 'express';
import { prisma } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { asyncHandler } from './utils/asyncHandler';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth.routes';
import { eventsRouter } from './routes/events.routes';
import { eventBookingsRouter, bookingsRouter } from './routes/bookings.routes';
import { paymentRoutes } from './routes/payments.routes';
import { webhookRoutes } from './routes/webhook.routes';

export function createApp(): express.Application {
  const app = express();

  // ── Global middleware (Pre-JSON) ──────────────────────────────────────────
  app.use(helmet());
  app.use(cors({ origin: '*' })); // Allow all origins for Vercel deployment

  app.use(express.json());

  // ── Application Routes ──────────────────────────────────────────────────
  app.use('/auth', authRouter);
  app.use('/events', eventsRouter);
  // Re-mount events under bookings for logical hierarchy
  app.use('/events', eventBookingsRouter);
  app.use('/bookings', bookingsRouter);
  app.use('/payments', paymentRoutes);
  app.use('/webhook', webhookRoutes);

  // ── Health route ──────────────────────────────────────────────────────────
  // Verifies the process is alive AND Postgres is reachable.
  // Returns 200 { status: "ok", db: "connected" } on success.
  // Returns 503 { status: "degraded", db: "unreachable" } if Postgres is down.
  app.get(
    '/health',
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', db: 'connected' });
    }),
  );

  // ── Business routes ───────────────────────────────────────────────────────
  app.use('/auth', authRouter);                          // Step 3 ✅
  app.use('/events', eventsRouter);                      // Step 5 ✅
  app.use('/events', eventBookingsRouter);               // Step 6 ✅
  app.use('/bookings', bookingsRouter);                  // Step 6 ✅
  app.use('/payments', paymentRoutes);                   // Phase 2 Step 5 ✅

  // ── 404 handler — must come after all routes ───────────────────────────────
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // ── Central error handler — must be last ──────────────────────────────────
  app.use(
    (err: unknown, req: Request, res: Response, next: NextFunction): void => {
      errorHandler(err, req, res, next);
    },
  );

  return app;
}
