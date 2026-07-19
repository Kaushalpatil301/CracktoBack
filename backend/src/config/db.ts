/**
 * config/db.ts
 *
 * Exports a singleton PrismaClient instance.
 *
 * Rules:
 *  - Import `prisma` from this file everywhere — never instantiate PrismaClient
 *    directly in a service or controller.
 *  - In test environments, the same singleton is used; test setup/teardown is
 *    responsible for cleaning data between tests, NOT for creating new clients.
 *  - Do NOT call prisma.$disconnect() inside request handlers; that is handled
 *    by the process lifecycle (SIGTERM handler in src/index.ts).
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

// Persist the singleton across hot-reloads in development (ts-node-dev).
if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
