/**
 * middleware/errorHandler.ts
 *
 * Central error → HTTP status mapping.
 * This is the ONLY place in the codebase that sets HTTP status codes for
 * errors. Controllers throw typed AppError subclasses; this middleware
 * catches them and formats the response as { error: { code, message } }.
 *
 * Rules enforced here:
 *  - No stack trace or internal detail is ever sent to the client.
 *  - Full error detail (including stack) is logged server-side only.
 *  - Unknown/unclassified errors produce a 500 with a generic message.
 */

import { NextFunction, Request, Response } from 'express';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InsufficientSeatsError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../types/errors';

/** Canonical client-facing error response shape. */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

function toHttpStatus(err: AppError): number {
  if (err instanceof ValidationError) return 400;
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof InsufficientSeatsError) return 409;
  if (err instanceof ConflictError) return 409;
  return 500;
}

// Express 4 error handlers must have exactly 4 parameters.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Always log the full error server-side (sanitised — no secrets in the log
  // line, but full stack is fine for internal diagnosis).
  console.error('[ErrorHandler]', err);

  if (err instanceof AppError) {
    const status = toHttpStatus(err);
    const body: ErrorResponse = {
      error: { code: err.code, message: err.message },
    };
    res.status(status).json(body);
    return;
  }

  // Prisma unique-constraint violation (P2002) — surfaces as a 409 when a
  // duplicate idempotency key hits the DB. Handled here so callers don't need
  // to import Prisma error types into services.
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as Record<string, unknown>)['code'] === 'P2002'
  ) {
    const body: ErrorResponse = {
      error: { code: 'CONFLICT', message: 'Duplicate request — resource already exists' },
    };
    res.status(409).json(body);
    return;
  }

  // Unclassified error — never expose detail to the client.
  const body: ErrorResponse = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
  res.status(500).json(body);
}
