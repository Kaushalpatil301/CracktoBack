/**
 * schemas/events.schemas.ts
 *
 * Zod schemas for event route request bodies and query params.
 */

import { z } from 'zod';

export const CreateEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  venue: z.string().min(1, 'Venue is required').max(300),
  startTime: z
    .string()
    .datetime({ message: 'startTime must be an ISO 8601 datetime string' })
    .refine((v) => new Date(v) > new Date(), {
      message: 'startTime must be in the future',
    }),
  totalSeats: z
    .number()
    .int('totalSeats must be an integer')
    .positive('totalSeats must be greater than 0'),
  price: z
    .number()
    .int('price must be an integer (in cents)')
    .positive('price must be greater than 0 (free events not supported in Phase 2)'),
});

export const UpdateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  venue: z.string().min(1).max(300).optional(),
  startTime: z
    .string()
    .datetime({ message: 'startTime must be an ISO 8601 datetime string' })
    .refine((v) => new Date(v) > new Date(), {
      message: 'startTime must be in the future',
    })
    .optional(),
  price: z
    .number()
    .int()
    .positive()
    .optional(),
  // totalSeats cannot be changed after creation — seats are already sold
});

export const EventListQuerySchema = z.object({
  venue: z.string().optional(),
  organizerId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().positive()),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

// Route params: :id must be a non-empty string (UUID validation left to DB)
export const EventIdParamSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type EventListQuery = z.infer<typeof EventListQuerySchema>;
