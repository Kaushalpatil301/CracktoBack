/**
 * tests/unit/authorize.test.ts
 *
 * Unit tests for the authorize(role) middleware factory.
 * No DB or JWT needed — pure in-memory logic.
 *
 * Covers per code-standards §6 (three minimum RBAC cases):
 *  1. Correct role → next() with no error
 *  2. Wrong role → ForbiddenError (403)
 *  3. No user on req (authenticate not run) → ForbiddenError safeguard
 */

import { Request, Response, NextFunction } from 'express';
import { authorize } from '../../src/middleware/authorize';
import { ForbiddenError } from '../../src/types/errors';
import type { RequestUser } from '../../src/types/express';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReqWithUser(user: RequestUser): Request {
  return { user } as unknown as Request;
}

function makeReqNoUser(): Request {
  return { headers: {} } as Request;
}

function makeNext(): { fn: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn: NextFunction = (err?: unknown) => {
    calls.push(err === undefined ? null : err);
  };
  return { fn, calls };
}

const organizerUser: RequestUser = { id: 'org-1', email: 'org@test.com', role: 'ORGANIZER' };
const customerUser: RequestUser = { id: 'cust-1', email: 'cust@test.com', role: 'CUSTOMER' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  describe('authorize("ORGANIZER")', () => {
    const mw = authorize('ORGANIZER');

    test('ORGANIZER role → next() called with no error', () => {
      const { fn, calls } = makeNext();
      mw(makeReqWithUser(organizerUser), {} as Response, fn);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBeNull();
    });

    test('CUSTOMER role → ForbiddenError (wrong role)', () => {
      const { fn, calls } = makeNext();
      mw(makeReqWithUser(customerUser), {} as Response, fn);
      expect(calls[0]).toBeInstanceOf(ForbiddenError);
      expect((calls[0] as ForbiddenError).code).toBe('FORBIDDEN');
    });

    test('no user on req (authenticate not run) → ForbiddenError safeguard', () => {
      const { fn, calls } = makeNext();
      mw(makeReqNoUser(), {} as Response, fn);
      expect(calls[0]).toBeInstanceOf(ForbiddenError);
    });
  });

  describe('authorize("CUSTOMER")', () => {
    const mw = authorize('CUSTOMER');

    test('CUSTOMER role → next() called with no error', () => {
      const { fn, calls } = makeNext();
      mw(makeReqWithUser(customerUser), {} as Response, fn);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBeNull();
    });

    test('ORGANIZER role → ForbiddenError (wrong role)', () => {
      const { fn, calls } = makeNext();
      mw(makeReqWithUser(organizerUser), {} as Response, fn);
      expect(calls[0]).toBeInstanceOf(ForbiddenError);
    });
  });

  test('error body shape is preserved — code is FORBIDDEN', () => {
    const { fn, calls } = makeNext();
    authorize('ORGANIZER')(makeReqWithUser(customerUser), {} as Response, fn);
    const err = calls[0] as ForbiddenError;
    expect(err.code).toBe('FORBIDDEN');
    expect(typeof err.message).toBe('string');
    expect(err.message.length).toBeGreaterThan(0);
  });
});
