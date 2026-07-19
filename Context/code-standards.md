# Code Standards

## 1. TypeScript Rules
* Strict mode on (`strict: true` in `tsconfig.json`), no exceptions. Explicit return types on every exported function.
* Every request/response shape that crosses a route boundary is a typed interface or Zod-inferred type — never `any`, never an untyped `req.body`.
* No bare `catch {}` — always catch, log server-side (sanitized — no password hashes, JWT secrets, or tokens in logs), and respond through the shared error handler. Route handlers never leak a raw error/stack trace to the client.
* One responsibility per file: controllers only parse request → call service → shape response. Services own business logic and DB transactions. No SQL or Prisma calls inside a controller.
* No function exceeds ~60 lines. If a service method is doing "validate + transact + enqueue + format response," split it — e.g. extract the transaction body to its own private method.

## 2. Project Structure
```
event-booking-backend/
├── src/
│   ├── index.ts                     # process entrypoint, starts server + outbox poller + workers
│   ├── app.ts                       # Express app, middleware wiring, route mounting
│   ├── config/
│   │   ├── env.ts                   # parsed/typed env vars (Zod-validated at startup)
│   │   └── db.ts                    # Prisma client singleton
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── events.routes.ts
│   │   └── bookings.routes.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── events.controller.ts
│   │   └── bookings.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── events.service.ts
│   │   └── bookings.service.ts
│   ├── middleware/
│   │   ├── authenticate.ts          # verifies JWT, attaches req.user
│   │   ├── authorize.ts             # role check
│   │   ├── requireEventOwner.ts     # resource-ownership check
│   │   ├── validate.ts              # Zod schema middleware factory
│   │   └── errorHandler.ts
│   ├── queue/
│   │   ├── connection.ts            # ioredis connection, shared across queues/workers
│   │   ├── queues.ts                # BullMQ Queue instances (bookingConfirmationQueue, eventUpdateQueue)
│   │   ├── outboxPoller.ts          # polls outbox_events, enqueues to BullMQ, marks processed
│   │   └── workers/
│   │       ├── bookingConfirmation.worker.ts
│   │       └── eventUpdateNotification.worker.ts
│   ├── schemas/                     # Zod request schemas
│   ├── types/                       # shared TS types (e.g. AuthedRequest with req.user)
│   └── utils/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── unit/
│   └── integration/
│       └── booking.concurrency.test.ts   # parallel-request overbooking test
├── docker-compose.yml                # postgres + redis, local dev only
├── .env.example
├── package.json
├── tsconfig.json
├── frontend/                         # Phase 2 React/Vite app
│   ├── src/
│   │   ├── api.ts                    # centralized fetch wrapper (handles JWT attachment)
│   │   ├── components/               # reusable UI (buttons, cards, forms)
│   │   ├── pages/                    # route-level components
│   │   ├── index.css                 # Neobrutalism design tokens (CSS variables)
│   │   └── App.tsx
│   └── package.json
└── context/                          # this five-file planning system
```

## 3. Frontend Standards (Phase 2)
* **Design System & Styling:** Neobrutalism aesthetic. All styling must be driven by CSS variables defined in `index.css` (e.g., `--color-primary`, `--border-width-thick`, `--shadow-hard`).
* **No Inline Styles:** Absolutely no `style={{}}` tags unless dynamically calculating a transform/animation value that CSS cannot handle. Use classes that map to the design tokens.
* **Component Structure:** Reusable components go in `src/components/` (e.g., `Button`, `Card`, `Input`). Page-level layouts go in `src/pages/`.
* **API Communication:** All backend requests must go through a centralized `api.ts` fetch wrapper that automatically attaches the `Authorization: Bearer <token>` header from local storage. Components should not call `fetch` directly.

## 3. Service Function Contract (every state-changing service method follows this exact shape)
```ts
async function createBooking(input: CreateBookingInput): Promise<Booking> {
  /**
   * 1. Validate business rules that Zod can't express (e.g. event.startTime not in the past).
   * 2. Run everything inside prisma.$transaction:
   *    a. Atomic conditional UPDATE on events.availableSeats (raw parameterized query).
   *    b. If 0 rows affected -> throw a typed InsufficientSeatsError (mapped to 409 upstream).
   *    c. INSERT booking (idempotencyKey unique constraint handles duplicate submits).
   *    d. INSERT outbox_events row (job_type = BOOKING_CONFIRMATION) in the SAME transaction.
   * 3. Return the created booking. Never call queue.add() directly from here.
   * 4. Never swallow an error silently — typed errors bubble to the controller's catch,
   *    which maps them to the correct HTTP status via the shared error handler.
   */
}
```

## 4. API & Async Rules
* Every controller wraps its service call in try/catch (or uses an `asyncHandler` wrapper) and passes errors to `next(err)` — never an unhandled rejection in a route.
* All DB access is `await`ed through Prisma; no synchronous/blocking calls in the request path.
* The seat-decrement + booking-insert + outbox-insert sequence is always inside a single `prisma.$transaction` — never three separate calls that could partially commit.
* BullMQ workers are separate `Worker` instances with an explicit `concurrency` setting and an explicit retry config (`attempts`, `backoff: { type: 'exponential', delay: ... }`) — not left at library defaults without being written down here once decided.
* The outbox poller runs on a fixed interval (documented once decided, e.g. 1000ms) and processes rows in a small batch with `FOR UPDATE SKIP LOCKED` if multiple poller instances are ever run — single instance is sufficient for this phase, but the query is written to already be safe for that future.

## 5. Validation & Error Rules
* Every route's input validated by a Zod schema in `schemas/` before the controller body runs, via the `validate` middleware factory.
* Errors are typed (`InsufficientSeatsError`, `NotFoundError`, `ForbiddenError`, `ValidationError`) and mapped to HTTP status in one place (`errorHandler.ts`) — controllers throw typed errors, they don't set status codes themselves.
* Response error shape is always `{ error: { code: string, message: string } }`. Stack traces only in server-side logs, never in the response body.

## 6. Testing Standard
* Every service has: one happy-path test, one test for its primary failure mode (insufficient seats / not found / forbidden), one edge-case test (zero/negative seats requested, missing fields).
* `tests/integration/booking.concurrency.test.ts` fires N parallel booking requests at an event with fewer available seats than requested total, against a real (test) Postgres instance, and asserts `availableSeats` never goes negative and the sum of confirmed booking seats never exceeds `totalSeats`. This test is non-negotiable — it's the one that actually proves the concurrency claim rather than just asserting it in a doc.
* Worker tests mock the job payload and assert the correct console output / side effect (e.g. correct set of customers notified) without needing a real Redis connection where feasible (use `bullmq`'s testing utilities or a lightweight in-memory job object for unit tests; integration test against real Redis separately).
* Run the full suite (`jest`) before considering any step "done" — do not move to the next build-order step until it passes.

## 7. Definition of Done (per step — check this before updating progress-tracker.md)
1. Typed input/output for every new function (no `any`).
2. State-changing DB writes that need a background job include the outbox insert in the same transaction — verified by a test that kills/skips the poller and confirms the outbox row still exists (nothing was lost).
3. RBAC-protected routes tested for: correct role + wrong role + correct role wrong owner (three cases minimum).
4. Passing unit + relevant integration tests, including the concurrency test where applicable.
5. No stack trace or internal error detail reachable in any tested error response.
6. Manually exercised once via curl/Postman end-to-end, not just via automated tests.
