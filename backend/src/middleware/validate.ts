/**
 * middleware/validate.ts
 *
 * Zod schema validation middleware factory.
 * Usage: router.post('/path', validate(MySchema), handler)
 *
 * Parses req.body through the provided Zod schema. On failure, calls
 * next(new ValidationError(...)) which routes to errorHandler.ts for a 400.
 * On success, replaces req.body with the parsed (typed, stripped of unknown
 * keys) output so the controller receives clean data.
 *
 * Rule: every state-changing route must use this middleware — never access
 * req.body directly in a controller without it having passed through validate().
 */

import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny, ZodError, z } from 'zod';
import { ValidationError } from '../types/errors';

/** Validates req.body through a Zod schema. Use on POST/PUT routes. */
export function validate<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body) as ReturnType<S['safeParse']>;
    if (!result.success) {
      const message = formatZodError((result as { error: ZodError }).error);
      next(new ValidationError(message));
      return;
    }
    req.body = (result as { data: z.output<S> }).data;
    next();
  };
}

/** Validates req.query through a Zod schema. Use on GET routes. */
export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query) as ReturnType<S['safeParse']>;
    if (!result.success) {
      const message = formatZodError((result as { error: ZodError }).error);
      next(new ValidationError(message));
      return;
    }
    // Store parsed query on req.body so controllers access it uniformly
    // (req.query is read-only on Express; we pass parsed query via a custom key)
    (req as Request & { parsedQuery: z.output<S> }).parsedQuery = (result as { data: z.output<S> }).data;
    next();
  };
}

function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.') || 'body'}: ${e.message}`)
    .join('; ');
}
