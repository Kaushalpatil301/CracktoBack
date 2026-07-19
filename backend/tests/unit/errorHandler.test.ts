/**
 * tests/unit/errorHandler.test.ts
 *
 * Unit tests for the central error handler middleware.
 * Verifies:
 *  1. Typed AppError subclasses produce the correct HTTP status + body.
 *  2. Stack traces never appear in the response body.
 *  3. Prisma P2002 (unique constraint) maps to 409.
 *  4. Unclassified errors produce 500 with a generic message.
 *  5. Response shape is always exactly { error: { code, message } }.
 */

import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InsufficientSeatsError,
  ConflictError,
} from '../../src/types/errors';

// ── Mock helpers ───────────────────────────────────────────────────────────

interface MockRes {
  _status: number;
  _body: unknown;
  status(code: number): this;
  json(body: unknown): this;
}

function makeMocks(): { req: Request; res: Response; mock: MockRes; next: NextFunction } {
  const mock: MockRes = {
    _status: 0,
    _body: null,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return {
    req: {} as Request,
    res: mock as unknown as Response,
    mock,
    next: jest.fn() as unknown as NextFunction,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  describe('typed AppError subclasses map to correct HTTP status', () => {
    const cases: [unknown, number, string][] = [
      [new ValidationError('bad input'),  400, 'VALIDATION_ERROR'],
      [new UnauthorizedError(),           401, 'UNAUTHORIZED'],
      [new ForbiddenError(),              403, 'FORBIDDEN'],
      [new NotFoundError('Event'),        404, 'NOT_FOUND'],
      [new InsufficientSeatsError(),      409, 'INSUFFICIENT_SEATS'],
      [new ConflictError('duplicate'),    409, 'CONFLICT'],
    ];

    test.each(cases)('%s → status %i / code %s', (err, expectedStatus, expectedCode) => {
      const { req, res, mock, next } = makeMocks();
      errorHandler(err, req, res, next);
      expect(mock._status).toBe(expectedStatus);
      expect((mock._body as { error: { code: string } }).error.code).toBe(expectedCode);
    });
  });

  test('error body never contains a stack trace', () => {
    const { req, res, mock, next } = makeMocks();
    errorHandler(new NotFoundError('Event'), req, res, next);
    const body = JSON.stringify(mock._body);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/Error:/);
    expect(body).not.toMatch(/node_modules/);
  });

  test('Prisma P2002 unique constraint violation → 409 CONFLICT', () => {
    const { req, res, mock, next } = makeMocks();
    const prismaError = { code: 'P2002', message: 'Unique constraint failed' };
    errorHandler(prismaError, req, res, next);
    expect(mock._status).toBe(409);
    expect((mock._body as { error: { code: string } }).error.code).toBe('CONFLICT');
  });

  test('unclassified Error → 500 INTERNAL_ERROR, no internal detail in response', () => {
    const { req, res, mock, next } = makeMocks();
    errorHandler(new Error('something internal'), req, res, next);
    expect(mock._status).toBe(500);
    const body = mock._body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  test('response shape is always { error: { code, message } } — no extra keys', () => {
    const { req, res, mock, next } = makeMocks();
    errorHandler(new ForbiddenError(), req, res, next);
    const body = mock._body as { error: { code: string; message: string } };
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
    expect(Object.keys(body)).toEqual(['error']);
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
  });
});
