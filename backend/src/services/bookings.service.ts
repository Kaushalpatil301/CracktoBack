/**
 * services/bookings.service.ts
 *
 * ⚠️  CONCURRENCY-CRITICAL FILE — ai-workflow-rules.md §5 applies.
 * Any change to this file requires re-running the concurrency test and the
 * outbox durability test before committing.
 *
 * Core invariants (must never be broken):
 *
 *  1. ATOMIC SEAT DECREMENT:
 *     Seat reservation is done with a single raw parameterized UPDATE:
 *       UPDATE events SET "availableSeats" = "availableSeats" - $seats
 *       WHERE id = $eventId AND "availableSeats" >= $seats
 *     This is the ONLY safe way to decrement — never read then write.
 *     If 0 rows affected → InsufficientSeatsError (409). No other path
 *     can succeed without seats being available.
 *
 *  2. TRANSACTIONAL OUTBOX:
 *     The outbox INSERT (BOOKING_CONFIRMATION) is in the SAME
 *     prisma.$transaction as the seat decrement and booking insert.
 *     If the process crashes after commit, the poller will relay it.
 *     If it crashes before commit, nothing is lost (rolled back).
 *
 *  3. IDEMPOTENCY:
 *     UNIQUE(customerId, idempotencyKey) on bookings. A retried request
 *     with the same key returns the original booking (200) rather than
 *     creating a duplicate or erroring with 409 to the client.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import {
  ForbiddenError,
  InsufficientSeatsError,
  NotFoundError,
  ConflictError,
} from '../types/errors';
import type { Booking } from '@prisma/client';

// ── Input/output types ─────────────────────────────────────────────────────

export interface CreateBookingServiceInput {
  eventId: string;
  customerId: string;
  seats: number;
  idempotencyKey: string;
}

export interface CancelBookingServiceInput {
  bookingId: string;
  customerId: string; // always from req.user — never trusted from client
}

// ── createBooking ──────────────────────────────────────────────────────────

export async function createBooking(
  input: CreateBookingServiceInput,
): Promise<{ booking: Booking; isIdempotentRepeat: boolean }> {
  const { eventId, customerId, seats, idempotencyKey } = input;

  // Pre-check: confirm event exists before entering the transaction.
  // ON DELETE RESTRICT on bookings FK means an event with bookings cannot be
  // deleted, so this check is safe against the race of event-deletion.
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) throw new NotFoundError('Event');

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // ── Step 1: Atomic conditional seat decrement ────────────────────────
      // INVARIANT: This is the ONLY place seats are decremented.
      // Never use a SELECT + application-level check + separate UPDATE.
      // Raw parameterized SQL — lock semantics are explicit and auditable.
      const rowsAffected = await tx.$executeRaw`
        UPDATE events
        SET "availableSeats" = "availableSeats" - ${seats}
        WHERE id = ${eventId}
        AND "availableSeats" >= ${seats}
      `;

      if (rowsAffected === 0) {
        // Either availableSeats < seats, or event was concurrently deleted.
        throw new InsufficientSeatsError();
      }

      // ── Step 2: INSERT booking ───────────────────────────────────────────
      // UNIQUE(customerId, idempotencyKey) constraint guards against retries.
      // If this throws P2002, the catch block outside handles it.
      const newBooking = await tx.booking.create({
        data: {
          eventId,
          customerId,
          seats,
          status: 'CONFIRMED',
          idempotencyKey,
        },
      });

      // ── Step 3: INSERT outbox row (same transaction) ─────────────────────
      // INVARIANT: outbox INSERT is in the SAME transaction as the booking.
      // The poller will relay this to BullMQ. Never call queue.add() here.
      await tx.outboxEvent.create({
        data: {
          jobType: 'BOOKING_CONFIRMATION',
          payload: {
            bookingId: newBooking.id,
            eventId,
            customerId,
            seats,
          },
        },
      });

      return newBooking;
    });

    return { booking, isIdempotentRepeat: false };
  } catch (err) {
    // Idempotency: duplicate (customerId, idempotencyKey) → return original.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await prisma.booking.findFirst({
        where: { customerId, idempotencyKey },
      });
      if (existing) return { booking: existing, isIdempotentRepeat: true };
      // Should not happen — P2002 means the row exists, but guard anyway.
      throw new ConflictError('Duplicate booking key but original not found');
    }
    throw err;
  }
}

// ── cancelBooking ──────────────────────────────────────────────────────────

export async function cancelBooking(input: CancelBookingServiceInput): Promise<Booking> {
  const { bookingId, customerId } = input;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) throw new NotFoundError('Booking');

  // Ownership: customerId from req.user — the client cannot supply this.
  if (booking.customerId !== customerId) {
    throw new ForbiddenError('You do not own this booking');
  }

  // Idempotent cancel: return the already-cancelled booking without re-releasing seats.
  if (booking.status === 'CANCELLED') return booking;

  // Atomically release seats + mark cancelled in one transaction.
  const [cancelled] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    }),
    prisma.event.update({
      where: { id: booking.eventId },
      data: { availableSeats: { increment: booking.seats } },
    }),
    prisma.outboxEvent.create({
      data: {
        jobType: 'BOOKING_CANCELLATION',
        payload: {
          bookingId: booking.id,
          eventId: booking.eventId,
          customerId: booking.customerId,
          seats: booking.seats,
        },
      },
    }),
  ]);

  return cancelled;
}

// ── partialCancelBooking ───────────────────────────────────────────────────

export async function partialCancelBooking(
  bookingId: string,
  customerId: string,
  seatsToCancel: number
): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) throw new NotFoundError('Booking');
  if (booking.customerId !== customerId) {
    throw new ForbiddenError('You do not own this booking');
  }

  if (booking.status === 'CANCELLED') return booking;

  // If cancelling all or more seats, do a full cancellation
  if (seatsToCancel >= booking.seats) {
    return cancelBooking({ bookingId, customerId });
  }

  if (seatsToCancel <= 0) {
    throw new Error('Seats to cancel must be greater than zero');
  }

  const [updated] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { seats: { decrement: seatsToCancel } },
    }),
    prisma.booking.create({
      data: {
        eventId: booking.eventId,
        customerId: booking.customerId,
        seats: seatsToCancel,
        status: 'CANCELLED',
        idempotencyKey: `${booking.idempotencyKey}-cancel-${Date.now()}`
      }
    }),
    prisma.event.update({
      where: { id: booking.eventId },
      data: { availableSeats: { increment: seatsToCancel } },
    }),
    prisma.outboxEvent.create({
      data: {
        jobType: 'BOOKING_CANCELLATION',
        payload: {
          bookingId: booking.id,
          eventId: booking.eventId,
          customerId: booking.customerId,
          seats: seatsToCancel,
        },
      },
    }),
  ]);

  return updated;
}

// ── listMyBookings ─────────────────────────────────────────────────────────

export async function listMyBookings(customerId: string) {
  const bookings = await prisma.booking.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: { event: true },
  });

  return bookings.map(b => ({
    ...b,
    totalPrice: b.seats * b.event.price,
  }));
}
