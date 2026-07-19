/**
 * services/auth.service.ts
 *
 * Authentication business logic: register and login.
 * No HTTP concerns (no req/res). Throws typed errors for all failure modes.
 *
 * Invariants:
 *  - Password is hashed with bcrypt before storage. Plain-text password never
 *    persists or appears in logs.
 *  - JWT is signed with the secret from env; expiry is env.JWT_EXPIRES_IN (7d).
 *  - Duplicate email → ConflictError (mapped to 409 by errorHandler).
 *  - Wrong credentials → UnauthorizedError (mapped to 401).
 */

import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ConflictError, UnauthorizedError } from '../types/errors';
import type { RegisterInput, LoginInput } from '../schemas/auth.schemas';

// ── Output types ───────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  sub: string;   // user id
  email: string;
  role: 'ORGANIZER' | 'CUSTOMER';
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'ORGANIZER' | 'CUSTOMER';
  };
}

// ── Service functions ──────────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('A user with that email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { token, user };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Use a constant-time compare even when user doesn't exist to prevent
  // user-enumeration via timing differences.
  const passwordHash = user?.passwordHash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000';
  const match = await bcrypt.compare(input.password, passwordHash);

  if (!user || !match) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

// ── Private helpers ────────────────────────────────────────────────────────

function signToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}
