/**
 * routes/auth.routes.ts
 *
 * Auth routes: POST /auth/register, POST /auth/login.
 * Middleware order per route:
 *  1. validate(Schema) — Zod parse before controller body runs
 *  2. asyncHandler(controller) — catches async errors, forwards to errorHandler
 *
 * No authentication required on these routes (they produce the token).
 */

import { Router } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { RegisterSchema, LoginSchema } from '../schemas/auth.schemas';
import { registerController, loginController } from '../controllers/auth.controller';

const router = Router();

// POST /auth/register
router.post('/register', validate(RegisterSchema), asyncHandler(registerController));

// POST /auth/login
router.post('/login', validate(LoginSchema), asyncHandler(loginController));

export { router as authRouter };
