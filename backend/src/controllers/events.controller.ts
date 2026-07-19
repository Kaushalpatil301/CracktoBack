/**
 * controllers/events.controller.ts
 *
 * Event route handlers. One responsibility: parse request → call service →
 * shape response. No business logic or DB access here.
 */

import { Request, Response } from 'express';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  listEvents,
} from '../services/events.service';
import type { CreateEventInput, UpdateEventInput, EventListQuery } from '../schemas/events.schemas';
import type { AuthedRequest } from '../types/express';

export async function createEventController(req: Request, res: Response): Promise<void> {
  const { user } = req as AuthedRequest;
  const input = req.body as CreateEventInput;
  const event = await createEvent(user.id, input);
  res.status(201).json({ event });
}

export async function updateEventController(req: Request, res: Response): Promise<void> {
  // req.params.id ownership was verified by requireEventOwner middleware
  const eventId = req.params['id'] as string;
  const input = req.body as UpdateEventInput;
  const event = await updateEvent(eventId, input);
  res.status(200).json({ event });
}

export async function deleteEventController(req: Request, res: Response): Promise<void> {
  const eventId = req.params['id'] as string;
  await deleteEvent(eventId);
  res.status(204).send();
}

export async function getEventController(req: Request, res: Response): Promise<void> {
  const eventId = req.params['id'] as string;
  const event = await getEvent(eventId);
  res.status(200).json({ event });
}

export async function listEventsController(req: Request, res: Response): Promise<void> {
  const query = (req as Request & { parsedQuery: EventListQuery }).parsedQuery;
  const result = await listEvents(query);
  res.status(200).json(result);
}
