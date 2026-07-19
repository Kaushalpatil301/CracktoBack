/**
 * middleware/authenticate.ts
 *
 * JWT verification middleware. Runs before any route that requires auth.
 *
 * On success: attaches req.user = { id, email, role } and calls next().
 * On failure: calls next(new UnauthorizedError(...)) → 401 via errorHandler.
 *
 * Token must be provided as: Authorization: Bearer <token>
 *
 * Rule: this middleware only checks that the token is valid and not expired.
 * It does NOT check roles — that is the job of middleware/authorize.ts.
 * Keeping the two checks separate satisfies the architecture invariant:
 * "role check and ownership check are separate middleware/steps."
 */

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../types/errors';
import type { RequestUser } from '../types/express';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or malformed Authorization header'));
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (
      typeof decoded.sub !== 'string' ||
      typeof decoded.email !== 'string' ||
      (decoded.role !== 'ORGANIZER' && decoded.role !== 'CUSTOMER')
    ) {
      throw new Error('Malformed token payload');
    }

    // Attach typed user to the request — downstream middleware and controllers
    // can safely cast to AuthedRequest.
    (req as Request & { user: RequestUser }).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role as 'ORGANIZER' | 'CUSTOMER',
    };

    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
