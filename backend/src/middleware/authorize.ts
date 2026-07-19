/**
 * middleware/authorize.ts
 *
 * Role-check middleware factory (Layer 1 of the two-layer RBAC check).
 * Must always run AFTER authenticate.ts (requires req.user to be set).
 *
 * Usage: router.put('/events/:id', authenticate, authorize('ORGANIZER'), ...)
 *
 * This middleware ONLY checks the user's role. It does NOT check whether the
 * user owns the specific resource — that is requireEventOwner.ts's job.
 * Neither middleware substitutes for the other.
 *
 * On success: calls next().
 * On wrong role: calls next(new ForbiddenError(...)) → 403.
 */

import { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../types/errors';
import type { RequestUser } from '../types/express';

type AllowedRole = RequestUser['role'];

export function authorize(requiredRole: AllowedRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: RequestUser }).user;

    if (!user) {
      // authenticate middleware should always run first — this is a safeguard.
      next(new ForbiddenError('No authenticated user on request'));
      return;
    }

    if (user.role !== requiredRole) {
      next(new ForbiddenError(`This action requires the ${requiredRole} role`));
      return;
    }

    next();
  };
}
