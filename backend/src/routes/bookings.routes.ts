/**
 * routes/bookings.routes.ts
 *
 * Two routers are exported because bookings straddle two URL namespaces:
 *
 *  eventBookingsRouter (mounted at /events in app.ts):
 *    POST /events/:eventId/bookings  — Customer books seats on an event
 *
 *  bookingsRouter (mounted at /bookings in app.ts):
 *    GET  /bookings/me               — Customer lists their own bookings
 *    DELETE /bookings/:id            — Customer cancels their own booking
 *
 * RBAC:
 *  - POST booking: authenticate + authorize('CUSTOMER')
 *  - GET /me, DELETE /:id: authenticate only (filtering by req.user.id in service)
 *    → Organizers cannot book tickets on their own events by role enforcement.
 *
 * Ownership on DELETE is enforced in the service, not via middleware, because
 * booking ownership (customerId === req.user.id) is checked against the DB
 * row, and there is no requireBookingOwner middleware (not needed — the service
 * checks it directly and throws ForbiddenError on mismatch).
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { CreateBookingSchema } from '../schemas/bookings.schemas';
import {
  createBookingController,
  cancelBookingController,
  listMyBookingsController,
} from '../controllers/bookings.controller';

// ── Router 1: nested under /events ────────────────────────────────────────

const eventBookingsRouter = Router({ mergeParams: true });

// POST /events/:eventId/bookings
eventBookingsRouter.post(
  '/:eventId/bookings',
  authenticate,
  authorize('CUSTOMER'),
  validate(CreateBookingSchema),
  asyncHandler(createBookingController),
);

// ── Router 2: mounted at /bookings ────────────────────────────────────────

const bookingsRouter = Router();

// GET /bookings/me  — must be defined BEFORE /:id to prevent 'me' matching as an id
bookingsRouter.get('/me', authenticate, asyncHandler(listMyBookingsController));

// DELETE /bookings/:id
bookingsRouter.delete('/:id', authenticate, asyncHandler(cancelBookingController));

export { eventBookingsRouter, bookingsRouter };
