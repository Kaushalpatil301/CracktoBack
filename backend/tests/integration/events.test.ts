/**
 * tests/integration/events.test.ts
 *
 * Integration tests for the events CRUD API.
 * Uses a real Postgres instance. Verifies:
 *
 * Happy paths:
 *  - Organizer creates event → 201 with event body
 *  - Organizer updates own event → 200 + outbox row inserted (transactional outbox)
 *  - Organizer deletes own event → 204
 *  - Public GET /events/:id → 200
 *  - Public GET /events (list + filter) → 200 with pagination
 *
 * RBAC (three mandatory cases per code-standards §6):
 *  - Wrong role (Customer tries to create) → 403
 *  - Correct role (Organizer) but wrong owner (update another's event) → 403
 *  - Correct role + correct owner → passes (covered by happy path)
 *
 * Validation failures:
 *  - Missing required fields → 400
 *  - startTime in the past → 400
 *
 * Outbox durability (critical invariant):
 *  - After updateEvent: outbox row exists in DB, processedAt IS NULL
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/db';

const app = createApp();

// ── DB cleanup ─────────────────────────────────────────────────────────────

beforeEach(async () => {
  await prisma.outboxEvent.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function registerAndGetToken(
  role: 'ORGANIZER' | 'CUSTOMER',
  email = `${role.toLowerCase()}-${Date.now()}@test.com`,
): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/auth/register').send({
    name: `Test ${role}`,
    email,
    password: 'securepass123',
    role,
  });
  return {
    token: (res.body as { token: string }).token,
    userId: (res.body as { user: { id: string } }).user.id,
  };
}

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const validEvent = {
  title: 'Tech Conference 2026',
  description: 'Annual tech conference',
  venue: 'Convention Center, Mumbai',
  startTime: futureDate.toISOString(),
  totalSeats: 100,
  price: 1000,
};

// ── Create ─────────────────────────────────────────────────────────────────

describe('POST /events', () => {
  test('Organizer creates event → 201 with correct shape', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(validEvent);

    expect(res.status).toBe(201);
    const event = (res.body as { event: Record<string, unknown> }).event;
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('title', validEvent.title);
    expect(event).toHaveProperty('totalSeats', 100);
    expect(event).toHaveProperty('availableSeats', 100); // starts fully available
  });

  test('RBAC: Customer (wrong role) tries to create → 403', async () => {
    const { token } = await registerAndGetToken('CUSTOMER');
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(validEvent);
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  test('No auth token → 401', async () => {
    const res = await request(app).post('/events').send(validEvent);
    expect(res.status).toBe(401);
  });

  test('startTime in the past → 400 VALIDATION_ERROR', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validEvent, startTime: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  test('missing totalSeats → 400', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { totalSeats: _, ...withoutSeats } = validEvent;
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(withoutSeats);
    expect(res.status).toBe(400);
  });
});

// ── Update ─────────────────────────────────────────────────────────────────

describe('PUT /events/:id', () => {
  test('Organizer updates own event → 200 + outbox row written atomically', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const create = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(validEvent);
    const eventId = (create.body as { event: { id: string } }).event.id;

    // Confirm no outbox rows before update
    const before = await prisma.outboxEvent.count();
    expect(before).toBe(0);

    const res = await request(app)
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect((res.body as { event: { title: string } }).event.title).toBe('Updated Title');

    // CRITICAL: outbox row must exist AND be unprocessed (processedAt IS NULL)
    const outboxRows = await prisma.outboxEvent.findMany();
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.jobType).toBe('EVENT_UPDATE_NOTIFICATION');
    expect(outboxRows[0]?.processedAt).toBeNull();
    expect((outboxRows[0]?.payload as { eventId: string }).eventId).toBe(eventId);
  });

  test('RBAC: Correct role (Organizer) but wrong owner → 403', async () => {
    const org1 = await registerAndGetToken('ORGANIZER', 'org1@test.com');
    const org2 = await registerAndGetToken('ORGANIZER', 'org2@test.com');

    // org1 creates an event
    const create = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${org1.token}`)
      .send(validEvent);
    const eventId = (create.body as { event: { id: string } }).event.id;

    // org2 tries to update org1's event
    const res = await request(app)
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${org2.token}`)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  test('update non-existent event → 404', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const res = await request(app)
      .put('/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

// ── Delete ─────────────────────────────────────────────────────────────────

describe('DELETE /events/:id', () => {
  test('Organizer deletes own event → 204', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const create = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(validEvent);
    const eventId = (create.body as { event: { id: string } }).event.id;

    const res = await request(app)
      .delete(`/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Confirm it's gone
    const gone = await prisma.event.findUnique({ where: { id: eventId } });
    expect(gone).toBeNull();
  });

  test('wrong owner delete → 403', async () => {
    const org1 = await registerAndGetToken('ORGANIZER', 'del1@test.com');
    const org2 = await registerAndGetToken('ORGANIZER', 'del2@test.com');
    const create = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${org1.token}`)
      .send(validEvent);
    const eventId = (create.body as { event: { id: string } }).event.id;

    const res = await request(app)
      .delete(`/events/${eventId}`)
      .set('Authorization', `Bearer ${org2.token}`);
    expect(res.status).toBe(403);
  });
});

// ── Read (public) ──────────────────────────────────────────────────────────

describe('GET /events/:id', () => {
  test('public read of existing event → 200', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    const create = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send(validEvent);
    const eventId = (create.body as { event: { id: string } }).event.id;

    const res = await request(app).get(`/events/${eventId}`);
    expect(res.status).toBe(200);
    expect((res.body as { event: { id: string } }).event.id).toBe(eventId);
  });

  test('non-existent event → 404', async () => {
    const res = await request(app).get('/events/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /events (list)', () => {
  test('returns paginated list', async () => {
    const { token } = await registerAndGetToken('ORGANIZER');
    await request(app).post('/events').set('Authorization', `Bearer ${token}`).send(validEvent);

    const res = await request(app).get('/events');
    expect(res.status).toBe(200);
    const body = res.body as { events: unknown[]; total: number; page: number; limit: number };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('page', 1);
    expect(body).toHaveProperty('limit', 20);
  });
});
