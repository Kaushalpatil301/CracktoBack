/**
 * config/env.ts
 *
 * Parses and validates all required environment variables at process startup
 * using Zod. If any required variable is missing or malformed, the process
 * exits immediately with a clear error — no silent undefined leaks into
 * downstream modules.
 *
 * Import `env` everywhere instead of reading `process.env` directly.
 */

import { z } from 'zod';

const EnvSchema = z.object({
  // Worker Settings
  POLLER_INTERVAL_MS: z.string().transform(Number).default('2000'),

  // Server
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Database (Prisma reads DATABASE_URL directly; we validate it here too so
  // a bad value surfaces at startup rather than on first query)
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT — confirmed values: expiry = 7d, bcrypt rounds = 12 (OWASP default)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z
    .string()
    .default('12')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(8).max(14)),

  // Email (Optional - provided by GitHub Student Pack like SendGrid/Mailgun)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@eventbook.com'),
});

// Parse at module load time. Any missing/invalid var throws immediately.
const _parsed = EnvSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error('❌ Invalid environment variables:\n', _parsed.error.format());
  process.exit(1);
}

export const env = _parsed.data;

// Re-export the inferred type so callers can reference it without importing zod.
export type Env = z.infer<typeof EnvSchema>;
