/**
 * routes/events.routes.ts
 *
 * Event routes. Auth middleware stack per route:
 *
 *  POST   /events           authenticate → authorize('ORGANIZER') → validate → handler
 *  PUT    /events/:id       authenticate → authorize('ORGANIZER') → requireEventOwner → validate → handler
 *  DELETE /events/:id       authenticate → authorize('ORGANIZER') → requireEventOwner → handler
 *  GET    /events/:id       (public — no auth required)
 *  GET    /events           (public — no auth required; authenticated users may also call)
 *
 * Rule: both authenticate AND authorize run before any handler on
 * Organizer-scoped write routes. Neither substitutes for the other.
 * requireEventOwner adds the resource-ownership check on top.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { requireEventOwner } from '../middleware/requireEventOwner';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { CreateEventSchema, UpdateEventSchema, EventListQuerySchema } from '../schemas/events.schemas';
import {
  createEventController,
  updateEventController,
  deleteEventController,
  getEventController,
  listEventsController,
} from '../controllers/events.controller';

const router = Router();

// ── Organizer-only write routes ───────────────────────────────────────────

router.post(
  '/',
  authenticate,
  authorize('ORGANIZER'),
  validate(CreateEventSchema),
  asyncHandler(createEventController),
);

router.put(
  '/:id',
  authenticate,
  authorize('ORGANIZER'),
  asyncHandler(requireEventOwner), // loads + ownership check
  validate(UpdateEventSchema),
  asyncHandler(updateEventController),
);

router.delete(
  '/:id',
  authenticate,
  authorize('ORGANIZER'),
  asyncHandler(requireEventOwner),
  asyncHandler(deleteEventController),
);

// ── Public read routes (no auth required) ────────────────────────────────

// GET /events?venue=...&fromDate=...&toDate=...&page=1&limit=20
router.get(
  '/',
  validateQuery(EventListQuerySchema),
  asyncHandler(listEventsController),
);

router.get('/:id', asyncHandler(getEventController));

export { router as eventsRouter };
