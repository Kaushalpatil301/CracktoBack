/**
 * tests/integration/health.test.ts
 *
 * Integration tests for GET /health.
 * Verifies:
 *  1. Returns 200 { status: "ok", db: "connected" } when DB is reachable.
 *  2. Response shape is exact — no extra keys.
 *
 * Uses a real Postgres connection (the test DB must be running).
 * Prisma singleton is imported — same instance that app.ts uses.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/db';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health', () => {
  test('200 with db:connected when Postgres is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  test('response has exactly two keys: status and db', async () => {
    const res = await request(app).get('/health');
    expect(Object.keys(res.body as object).sort()).toEqual(['db', 'status']);
  });
});

describe('Unknown routes', () => {
  test('GET /nonexistent → 404 with error shape', async () => {
    const res = await request(app).get('/nonexistent-route-xyz');
    expect(res.status).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  test('POST /nonexistent → 404 with error shape', async () => {
    const res = await request(app).post('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });
});
