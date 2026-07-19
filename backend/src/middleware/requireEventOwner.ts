/**
 * middleware/requireEventOwner.ts
 *
 * Resource-ownership check (Layer 2 of the two-layer RBAC check).
 * Must always run AFTER authenticate + authorize('ORGANIZER').
 *
 * Loads the event identified by req.params.id from the DB and verifies that
 * event.organizerId === req.user.id. If not, fails with ForbiddenError (403).
 * If the event doesn't exist, fails with NotFoundError (404).
 *
 * Why a separate middleware and not inside the service?
 *   - The controller/service never sees a request it's not authorized for.
 *   - The check is consistent across all Organizer-scoped event routes
 *     (PUT, DELETE) without duplicating the logic in each service method.
 *   - It satisfies the architecture invariant: "role check and ownership
 *     check are separate middleware/steps, always both present."
 *
 * Side effect: attaches the loaded event to req so the controller/service
 * can re-use it without a second DB round-trip (avoids double-fetch).
 */

import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db';
import { ForbiddenError, NotFoundError } from '../types/errors';
import type { RequestUser } from '../types/express';

/** Shape of the event attached to req by this middleware. */
export interface EventOwnerContext {
  id: string;
  organizerId: string;
}

export async function requireEventOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as Request & { user?: RequestUser }).user;
  const eventId = req.params['id'];

  if (!user) {
    next(new ForbiddenError('No authenticated user on request'));
    return;
  }

  if (!eventId) {
    next(new ForbiddenError('No event ID in route params'));
    return;
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, organizerId: true },
  });

  if (!event) {
    next(new NotFoundError('Event'));
    return;
  }

  if (event.organizerId !== user.id) {
    next(new ForbiddenError('You do not own this event'));
    return;
  }

  // Attach the pre-loaded event to req so downstream handlers don't re-fetch.
  (req as Request & { event: EventOwnerContext }).event = event;
  next();
}
