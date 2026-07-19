/**
 * services/events.service.ts
 *
 * Event management business logic.
 * No HTTP concerns (no req/res). Throws typed errors for all failure modes.
 *
 * Outbox rule (architecture invariant):
 *  - createEvent: no background job → no outbox row (per data-flow diagram
 *    in architecture.md: "job_type = none for create")
 *  - updateEvent: ALWAYS inserts an outbox row with job_type =
 *    EVENT_UPDATE_NOTIFICATION, regardless of which fields changed.
 *    Decision locked: any field change triggers the notification.
 *
 * The outbox insert for updateEvent is in the SAME prisma.$transaction as the
 * event UPDATE. This is the transactional outbox invariant — never broken.
 */

import { prisma } from '../config/db';
import { NotFoundError, ConflictError } from '../types/errors';
import type { CreateEventInput, UpdateEventInput, EventListQuery } from '../schemas/events.schemas';
import type { Event } from '@prisma/client';

// ── Output types ───────────────────────────────────────────────────────────

export type EventSummary = Pick<
  Event,
  'id' | 'organizerId' | 'title' | 'description' | 'venue' | 'startTime' | 'totalSeats' | 'availableSeats' | 'price' | 'createdAt' | 'updatedAt'
>;

// ── Service functions ──────────────────────────────────────────────────────

export async function createEvent(
  organizerId: string,
  input: CreateEventInput,
): Promise<EventSummary> {
  const event = await prisma.event.create({
    data: {
      organizerId,
      title: input.title,
      description: input.description,
      venue: input.venue,
      startTime: new Date(input.startTime),
      totalSeats: input.totalSeats,
      availableSeats: input.totalSeats, // starts fully available
      price: input.price,
    },
  });
  return event;
}

export async function updateEvent(
  eventId: string,
  input: UpdateEventInput,
): Promise<EventSummary> {
  // Wrap event UPDATE + outbox INSERT in a single transaction.
  // Architecture invariant: outbox row is ALWAYS in the same transaction as
  // the business write — never written separately.
  const [event] = await prisma.$transaction([
    prisma.event.update({
      where: { id: eventId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.venue !== undefined && { venue: input.venue }),
        ...(input.startTime !== undefined && { startTime: new Date(input.startTime) }),
        ...(input.price !== undefined && { price: input.price }),
      },
    }),
    prisma.outboxEvent.create({
      data: {
        jobType: 'EVENT_UPDATE_NOTIFICATION',
        payload: { eventId },
      },
    }),
  ]);
  return event;
}

export async function deleteEvent(eventId: string): Promise<void> {
  // Check existence first for a clean 404 (Prisma throws P2025 on missing row,
  // but we want a typed NotFoundError surfaced to the client).
  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Event');

  // Check if the event has any bookings to prevent foreign key constraint violations
  const bookingsCount = await prisma.booking.count({ where: { eventId } });
  if (bookingsCount > 0) {
    throw new ConflictError('Cannot cancel an event that has booked tickets. Please refund or cancel bookings first.');
  }

  await prisma.event.delete({ where: { id: eventId } });
}

export async function getEvent(eventId: string): Promise<EventSummary> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event');
  return event;
}

export async function listEvents(query: EventListQuery): Promise<{
  events: EventSummary[];
  total: number;
  page: number;
  limit: number;
}> {
  const { fromDate, toDate, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: any = {
    ...(query.venue && { venue: { contains: query.venue, mode: 'insensitive' } }),
    ...(query.organizerId && { organizerId: query.organizerId }),
    ...(fromDate && { startTime: { gte: new Date(fromDate) } }),
    ...(toDate && {
      startTime: {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        lte: new Date(toDate),
      },
    }),
  };

  const [events, total] = await prisma.$transaction([
    prisma.event.findMany({ where, skip, take: limit, orderBy: { startTime: 'asc' } }),
    prisma.event.count({ where }),
  ]);

  return { events, total, page, limit };
}
