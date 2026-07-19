/**
 * controllers/bookings.controller.ts
 *
 * Booking route handlers. One responsibility: parse request → call service →
 * shape response. No business logic or DB access here.
 *
 * Security rules enforced here:
 *  - customerId always comes from req.user.id (JWT), never from req.body.
 *  - Idempotency-Key is read from the request header, not the body.
 *  - A missing Idempotency-Key on POST is rejected with 400 before the
 *    service is called (prevents accidental non-idempotent bookings).
 */

import { Request, Response } from 'express';
import { createBooking, cancelBooking, partialCancelBooking, listMyBookings } from '../services/bookings.service';
import type { CreateBookingInput } from '../schemas/bookings.schemas';
import type { AuthedRequest } from '../types/express';
import { ValidationError } from '../types/errors';

export async function createBookingController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthedRequest;
  const { seats } = req.body as CreateBookingInput;

  // Idempotency-Key header is mandatory on booking creation.
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw new ValidationError('Idempotency-Key header is required for booking creation');
  }

  // eventId comes from the route param, not client-supplied body.
  const eventId = req.params['eventId'] as string;

  const { booking, isIdempotentRepeat } = await createBooking({
    eventId,
    customerId: user.id,
    seats,
    idempotencyKey: idempotencyKey.trim(),
  });

  const status = isIdempotentRepeat ? 200 : 201;
  res.status(status).json({ booking });
}

export async function cancelBookingController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthedRequest;
  const bookingId = req.params['id'] as string;

  const booking = await cancelBooking({ bookingId, customerId: user.id });
  res.status(200).json({ booking });
}

export async function partialCancelBookingController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthedRequest;
  const bookingId = req.params['id'] as string;
  const seatsToCancel = parseInt(req.body.seats, 10);

  if (isNaN(seatsToCancel) || seatsToCancel <= 0) {
    throw new ValidationError('Invalid number of seats to cancel');
  }

  const booking = await partialCancelBooking(bookingId, user.id, seatsToCancel);
  res.status(200).json({ booking });
}

export async function listMyBookingsController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthedRequest;
  const bookings = await listMyBookings(user.id);
  res.status(200).json({ bookings });
}
