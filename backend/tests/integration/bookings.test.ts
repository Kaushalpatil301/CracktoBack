/**
 * tests/integration/bookings.test.ts
 *
 * Integration tests for the bookings API.
 * Uses a real Postgres instance to verify concurrency, transactional outbox,
 * and idempotency invariants.
 *
 * Critical coverage:
 *  - Atomic seat decrement (Concurrency Test)
 *  - Transactional outbox (Outbox rows inserted correctly)
 *  - Idempotent creates and cancels
 *  - RBAC: Organizer cannot book, Customer can't access others' bookings.
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

async function createEvent(token: string, totalSeats = 10): Promise<string> {
  const res = await request(app)
    .post('/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Test Event',
      description: 'Desc',
      venue: 'Venue',
      startTime: new Date(Date.now() + 86400000).toISOString(),
      totalSeats,
      price: 1000,
    });
  return (res.body as { event: { id: string } }).event.id;
}

// ── Create Booking ─────────────────────────────────────────────────────────

describe('POST /events/:eventId/bookings', () => {
  test('Happy path: Customer books seats → 201 + outbox written', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    
    const cust = await registerAndGetToken('CUSTOMER');
    const res = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'idemp-1')
      .send({ seats: 2 });
      
    expect(res.status).toBe(201);
    const booking = (res.body as { booking: Record<string, unknown> }).booking;
    expect(booking).toHaveProperty('id');
    expect(booking).toHaveProperty('status', 'CONFIRMED');
    
    // Check availableSeats decreased
    const evt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(evt?.availableSeats).toBe(8);
    
    // Check outbox row exists
    const outboxRows = await prisma.outboxEvent.findMany({
      where: { jobType: 'BOOKING_CONFIRMATION' }
    });
    expect(outboxRows).toHaveLength(1);
    expect((outboxRows[0]?.payload as any).bookingId).toBe(booking.id);
  });

  test('RBAC: Organizer cannot book seats on events', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    
    const res = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${org.token}`)
      .set('Idempotency-Key', 'idemp-2')
      .send({ seats: 2 });
      
    expect(res.status).toBe(403);
  });

  test('Validation: Missing Idempotency-Key → 400', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    
    const cust = await registerAndGetToken('CUSTOMER');
    const res = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      // No idempotency key header
      .send({ seats: 2 });
      
    expect(res.status).toBe(400);
  });

  test('Idempotency: Same key returns 200 and existing booking', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust = await registerAndGetToken('CUSTOMER');
    
    const res1 = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'idemp-same')
      .send({ seats: 2 });
    expect(res1.status).toBe(201);
    
    const res2 = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'idemp-same')
      .send({ seats: 2 });
    expect(res2.status).toBe(200);
    expect((res2.body as any).booking.id).toBe((res1.body as any).booking.id);
    
    // Check seats only decremented once
    const evt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(evt?.availableSeats).toBe(8); // Not 6
  });

  test('Concurrency: Prevent overselling seats (Atomic Decrement)', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust1 = await registerAndGetToken('CUSTOMER');
    const cust2 = await registerAndGetToken('CUSTOMER');
    const cust3 = await registerAndGetToken('CUSTOMER');

    // Try to book 15 seats total across 3 concurrent requests (event only has 10)
    // 5 + 5 + 5 = 15. Only two should succeed.
    const req1 = request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust1.token}`)
      .set('Idempotency-Key', 'c1')
      .send({ seats: 5 });
    const req2 = request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust2.token}`)
      .set('Idempotency-Key', 'c2')
      .send({ seats: 5 });
    const req3 = request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust3.token}`)
      .set('Idempotency-Key', 'c3')
      .send({ seats: 5 });

    const results = await Promise.all([req1, req2, req3]);
    
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 409);
    
    expect(successes.length).toBe(2);
    expect(failures.length).toBe(1);
    expect((failures[0]?.body as any).error.code).toBe('INSUFFICIENT_SEATS');
    
    const evt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(evt?.availableSeats).toBe(0);
  });
});

// ── Cancel & List Bookings ──────────────────────────────────────────────────

describe('DELETE /bookings/:id & GET /bookings/me', () => {
  test('Customer cancels booking → seats returned', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust = await registerAndGetToken('CUSTOMER');
    
    const bookRes = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'idemp-cancel')
      .send({ seats: 3 });
    const bookingId = (bookRes.body as any).booking.id;
    
    const cancelRes = await request(app)
      .delete(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${cust.token}`);
    expect(cancelRes.status).toBe(200);
    expect((cancelRes.body as any).booking.status).toBe('CANCELLED');
    
    // Verify seats returned
    const evt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(evt?.availableSeats).toBe(10);
  });

  test('Idempotent cancel: cancelling again returns 200, seats unaffected', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust = await registerAndGetToken('CUSTOMER');
    
    const bookRes = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'idemp-cancel-idem')
      .send({ seats: 3 });
    const bookingId = (bookRes.body as any).booking.id;
    
    await request(app).delete(`/bookings/${bookingId}`).set('Authorization', `Bearer ${cust.token}`);
    
    // Second time
    const cancelRes2 = await request(app)
      .delete(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${cust.token}`);
    expect(cancelRes2.status).toBe(200);
    
    // Verify seats didn't increment again
    const evt = await prisma.event.findUnique({ where: { id: eventId } });
    expect(evt?.availableSeats).toBe(10); // NOT 13
  });

  test('Ownership: Cannot cancel someone else\'s booking', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust1 = await registerAndGetToken('CUSTOMER');
    const cust2 = await registerAndGetToken('CUSTOMER');
    
    const bookRes = await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust1.token}`)
      .set('Idempotency-Key', 'idemp-cancel-other')
      .send({ seats: 3 });
    const bookingId = (bookRes.body as any).booking.id;
    
    const cancelRes = await request(app)
      .delete(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${cust2.token}`);
    expect(cancelRes.status).toBe(403);
  });

  test('GET /bookings/me lists own bookings', async () => {
    const org = await registerAndGetToken('ORGANIZER');
    const eventId = await createEvent(org.token, 10);
    const cust = await registerAndGetToken('CUSTOMER');
    
    await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'b1')
      .send({ seats: 1 });
      
    await request(app)
      .post(`/events/${eventId}/bookings`)
      .set('Authorization', `Bearer ${cust.token}`)
      .set('Idempotency-Key', 'b2')
      .send({ seats: 2 });
      
    const listRes = await request(app)
      .get('/bookings/me')
      .set('Authorization', `Bearer ${cust.token}`);
    
    expect(listRes.status).toBe(200);
    expect((listRes.body as any).bookings).toHaveLength(2);
  });
});
