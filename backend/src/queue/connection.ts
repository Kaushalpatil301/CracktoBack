/**
 * queue/connection.ts
 *
 * Single shared Redis connection for BullMQ.
 * Reusing a single connection for the Queue instances avoids connection leak.
 */

import { Redis } from 'ioredis';
import { env } from '../config/env';

export const redisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});
