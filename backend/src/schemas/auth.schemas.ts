/**
 * schemas/auth.schemas.ts
 *
 * Zod schemas for auth route request bodies.
 * These are the single source of truth for input shapes — the validate
 * middleware factory uses them before the controller body runs.
 */

import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'), // bcrypt max input length
  role: z.enum(['ORGANIZER', 'CUSTOMER']),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
