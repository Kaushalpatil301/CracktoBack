/**
 * utils/asyncHandler.ts
 *
 * Wraps an async Express route handler so that any thrown error or rejected
 * promise is forwarded to next(err) rather than becoming an unhandled rejection.
 *
 * Usage in a controller:
 *   router.post('/path', asyncHandler(async (req, res) => { ... }));
 *
 * This satisfies the code-standards requirement: "Every controller wraps its
 * service call in try/catch (or uses an asyncHandler wrapper) and passes
 * errors to next(err)."
 */

import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
