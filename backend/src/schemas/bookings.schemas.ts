/**
 * schemas/bookings.schemas.ts
 *
 * Zod schemas for booking route request bodies.
 * Note: Idempotency-Key comes from the request header, not the body —
 * it is read by the controller and passed to the service separately.
 */

import { z } from 'zod';

export const CreateBookingSchema = z.object({
  seats: z
    .number()
    .int('seats must be an integer')
    .min(1, 'Must book at least 1 seat')
    .max(500, 'Cannot book more than 500 seats in a single request'),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;
