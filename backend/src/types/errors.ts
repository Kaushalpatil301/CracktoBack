/**
 * types/errors.ts
 *
 * Typed application error classes.
 * Every error the application can throw is one of these classes.
 * Controllers and services throw these; errorHandler.ts maps them to HTTP
 * status codes. No status-code logic lives outside errorHandler.ts.
 *
 * Rule: never throw a raw Error() from service code — always throw one of
 * these so the error handler can map it to the correct HTTP status without
 * a giant instanceof chain on unknown types.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain (needed when targeting ES5/CommonJS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — input failed Zod validation */
export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

/** 401 — missing or invalid JWT */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message);
  }
}

/** 403 — authenticated but wrong role or not the resource owner */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message);
  }
}

/** 404 — requested resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`);
  }
}

/**
 * 409 — booking attempted when availableSeats < requested seats,
 * or a duplicate booking insert violates the idempotency unique constraint.
 */
export class InsufficientSeatsError extends AppError {
  constructor() {
    super('INSUFFICIENT_SEATS', 'Not enough available seats for this booking');
  }
}

/** 409 — duplicate idempotency key submitted by a different customer (shouldn't
 *  happen in normal flow, but the DB constraint could fire if a bug slips in) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}
