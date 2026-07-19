/**
 * tests/unit/authenticate.test.ts
 *
 * Unit tests for the authenticate middleware.
 * The middleware reads env.JWT_SECRET (parsed once at import time from .env).
 * We sign tokens with that same value so the middleware accepts them.
 *
 * Coverage:
 *  - Valid token → req.user attached, next() called without error
 *  - Missing Authorization header → UnauthorizedError
 *  - Malformed header (no Bearer prefix) → UnauthorizedError
 *  - Expired token → UnauthorizedError
 *  - Tampered signature → UnauthorizedError
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../src/middleware/authenticate';
import { env } from '../../src/config/env';
import { UnauthorizedError } from '../../src/types/errors';

// Use the same secret the middleware uses (env singleton parsed from .env)
const SECRET = env.JWT_SECRET;

function makeToken(payload: object, secret = SECRET, options?: jwt.SignOptions): string {
  return jwt.sign(payload, secret, options);
}

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Request;
}

function makeNext(): { fn: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn: NextFunction = (err?: unknown) => {
    calls.push(err === undefined ? null : err);
  };
  return { fn, calls };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  test('valid token → next() called with no error, req.user attached', () => {
    const token = makeToken({ sub: 'user-123', email: 'test@example.com', role: 'CUSTOMER' });
    const req = makeReq(`Bearer ${token}`);
    const { fn, calls } = makeNext();

    authenticate(req, {} as Response, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeNull();
    expect((req as Request & { user: unknown }).user).toMatchObject({
      id: 'user-123',
      email: 'test@example.com',
      role: 'CUSTOMER',
    });
  });

  test('missing Authorization header → UnauthorizedError', () => {
    const { fn, calls } = makeNext();
    authenticate(makeReq(undefined), {} as Response, fn);
    expect(calls[0]).toBeInstanceOf(UnauthorizedError);
  });

  test('header without Bearer prefix → UnauthorizedError', () => {
    const token = makeToken({ sub: 'u', email: 'x@x.com', role: 'ORGANIZER' });
    const { fn, calls } = makeNext();
    authenticate(makeReq(`Token ${token}`), {} as Response, fn);
    expect(calls[0]).toBeInstanceOf(UnauthorizedError);
  });

  test('tampered signature (different secret) → UnauthorizedError', () => {
    // Sign with a different secret — middleware will reject it
    const token = makeToken(
      { sub: 'u', email: 'x@x.com', role: 'ORGANIZER' },
      'completely-different-secret-32chars!!',
    );
    const { fn, calls } = makeNext();
    authenticate(makeReq(`Bearer ${token}`), {} as Response, fn);
    expect(calls[0]).toBeInstanceOf(UnauthorizedError);
  });

  test('expired token → UnauthorizedError', () => {
    // nbf set in the past, expiresIn 0s — already expired by the time verify runs
    const token = makeToken(
      { sub: 'u', email: 'x@x.com', role: 'ORGANIZER', iat: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
      { expiresIn: 1 }, // 1 second — but we backdate iat, so it's expired
    );
    // Short sleep to guarantee token has expired (iat - 10s + 1s expiry = already expired)
    const { fn, calls } = makeNext();
    authenticate(makeReq(`Bearer ${token}`), {} as Response, fn);
    expect(calls[0]).toBeInstanceOf(UnauthorizedError);
  });
});
