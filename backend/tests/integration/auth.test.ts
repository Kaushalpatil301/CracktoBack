/**
 * tests/integration/auth.test.ts
 *
 * Integration tests for POST /auth/register and POST /auth/login.
 * Uses a real Postgres instance (test DB must be running).
 *
 * Coverage per code-standards §6:
 *  - Happy path (register + login)
 *  - Primary failure mode (wrong password, duplicate email)
 *  - Edge cases (missing fields, invalid email, short password, unknown role)
 *  - No stack trace in any error response
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/db';

const app = createApp();

// ── DB cleanup ─────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Delete in FK-safe order
  await prisma.outboxEvent.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Helpers ────────────────────────────────────────────────────────────────

const validOrganizer = {
  name: 'Alice Organizer',
  email: 'alice@test.com',
  password: 'securepass123',
  role: 'ORGANIZER',
};

// ── Register ───────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  test('happy path — creates user and returns token + user (no passwordHash)', async () => {
    const res = await request(app).post('/auth/register').send(validOrganizer);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(typeof (res.body as { token: string }).token).toBe('string');
    const user = (res.body as { user: Record<string, unknown> }).user;
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email', validOrganizer.email);
    expect(user).toHaveProperty('role', 'ORGANIZER');
    expect(user).not.toHaveProperty('passwordHash');
  });

  test('duplicate email → 409 CONFLICT', async () => {
    await request(app).post('/auth/register').send(validOrganizer);
    const res = await request(app).post('/auth/register').send(validOrganizer);
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('CONFLICT');
  });

  test('missing required field → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'missing@test.com', password: 'pass1234', role: 'CUSTOMER' });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  test('invalid email → 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validOrganizer, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('password too short (< 8 chars) → 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validOrganizer, email: 'short@test.com', password: 'abc' });
    expect(res.status).toBe(400);
  });

  test('unknown role → 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validOrganizer, email: 'role@test.com', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });

  test('error response never contains a stack trace', async () => {
    const res = await request(app).post('/auth/register').send({});
    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/node_modules/);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send(validOrganizer);
  });

  test('happy path — correct credentials return token + user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validOrganizer.email, password: validOrganizer.password });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    const user = (res.body as { user: Record<string, unknown> }).user;
    expect(user).toHaveProperty('email', validOrganizer.email);
    expect(user).not.toHaveProperty('passwordHash');
  });

  test('wrong password → 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validOrganizer.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  test('non-existent email → 401 (same response as wrong password — no enumeration)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'irrelevant' });
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  test('missing password field → 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: validOrganizer.email });
    expect(res.status).toBe(400);
  });
});
