/**
 * controllers/auth.controller.ts
 *
 * Auth route handlers. One responsibility: parse request → call service →
 * shape response. No business logic or DB access here.
 *
 * All errors propagate via next(err) to errorHandler.ts through asyncHandler.
 */

import { Request, Response } from 'express';
import { register, login } from '../services/auth.service';
import type { RegisterInput, LoginInput } from '../schemas/auth.schemas';

export async function registerController(req: Request, res: Response): Promise<void> {
  // req.body is already validated + typed by the validate(RegisterSchema) middleware
  const input = req.body as RegisterInput;
  const result = await register(input);
  res.status(201).json({
    token: result.token,
    user: result.user,
  });
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const input = req.body as LoginInput;
  const result = await login(input);
  res.status(200).json({
    token: result.token,
    user: result.user,
  });
}
