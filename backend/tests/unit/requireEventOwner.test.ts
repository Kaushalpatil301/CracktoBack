/**
 * tests/unit/requireEventOwner.test.ts
 *
 * Unit tests for requireEventOwner middleware.
 * Prisma is mocked — no real DB needed for these tests.
 *
 * Covers per code-standards §6 (three minimum RBAC cases):
 *  1. Owner making the request → event attached to req, next() with no error
 *  2. Correct role but wrong owner → ForbiddenError (403)
 *  3. Event not found → NotFoundError (404)
 *
 * Additional edge cases:
 *  4. No user on req → ForbiddenError safeguard
 *  5. No :id in route params → ForbiddenError safeguard
 */

import { Request, Response, NextFunction } from 'express';
import { requireEventOwner, EventOwnerContext } from '../../src/middleware/requireEventOwner';
import { ForbiddenError, NotFoundError } from '../../src/types/errors';
import type { RequestUser } from '../../src/types/express';

// ── Mock prisma ────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn();

jest.mock('../../src/config/db', () => ({
  prisma: {
    event: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReq(user: RequestUser | undefined, eventId: string | undefined): Request {
  const req: Record<string, unknown> = {
    params: eventId ? { id: eventId } : {},
  };
  if (user) req['user'] = user;
  return req as unknown as Request;
}

function makeNext(): { fn: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn: NextFunction = (err?: unknown) => {
    calls.push(err === undefined ? null : err);
  };
  return { fn, calls };
}

const ownerUser: RequestUser = { id: 'org-1', email: 'org@test.com', role: 'ORGANIZER' };
const otherUser: RequestUser = { id: 'org-2', email: 'other@test.com', role: 'ORGANIZER' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('requireEventOwner middleware', () => {
  beforeEach(() => mockFindUnique.mockReset());

  test('owner makes request → event attached to req, next() with no error', async () => {
    mockFindUnique.mockResolvedValue({ id: 'event-1', organizerId: 'org-1' });
    const req = makeReq(ownerUser, 'event-1');
    const { fn, calls } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeNull();
    const attached = (req as unknown as { event: EventOwnerContext }).event;
    expect(attached).toMatchObject({ id: 'event-1', organizerId: 'org-1' });
  });

  test('correct role (ORGANIZER) but wrong owner → ForbiddenError (403)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'event-1', organizerId: 'org-1' });
    const req = makeReq(otherUser, 'event-1'); // org-2 trying to touch org-1's event
    const { fn, calls } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(calls[0]).toBeInstanceOf(ForbiddenError);
    expect((calls[0] as ForbiddenError).code).toBe('FORBIDDEN');
  });

  test('event not found → NotFoundError (404)', async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = makeReq(ownerUser, 'nonexistent-event');
    const { fn, calls } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(calls[0]).toBeInstanceOf(NotFoundError);
    expect((calls[0] as NotFoundError).code).toBe('NOT_FOUND');
  });

  test('no user on req (authenticate not run) → ForbiddenError safeguard', async () => {
    const req = makeReq(undefined, 'event-1');
    const { fn, calls } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(calls[0]).toBeInstanceOf(ForbiddenError);
    expect(mockFindUnique).not.toHaveBeenCalled(); // short-circuit, no DB call
  });

  test('no :id in route params → ForbiddenError safeguard', async () => {
    const req = makeReq(ownerUser, undefined);
    const { fn, calls } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(calls[0]).toBeInstanceOf(ForbiddenError);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test('findUnique called with correct eventId from params', async () => {
    mockFindUnique.mockResolvedValue({ id: 'event-42', organizerId: 'org-1' });
    const req = makeReq(ownerUser, 'event-42');
    const { fn } = makeNext();

    await requireEventOwner(req, {} as Response, fn);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'event-42' },
      select: { id: true, organizerId: true },
    });
  });
});
