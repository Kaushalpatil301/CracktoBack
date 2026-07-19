# AI Workflow Rules

## 1. Execution Protocol
* **One layer at a time.** Build and fully verify the data layer before auth, verify auth before RBAC middleware, verify RBAC before events, verify events before bookings, verify bookings before the queue/worker layer — never implement two layers in the same pass, even if they seem related.
* **Build order (fixed, do not reorder):**
  1. `prisma/schema.prisma` (User, Event, Booking, OutboxEvent) + initial migration + `config/db.ts` + `config/env.ts`
  2. `app.ts` skeleton + `middleware/errorHandler.ts` + a `GET /health` route — confirm the server boots and connects to Postgres before writing any business logic
  3. `auth.service.ts` + `auth.controller.ts` + `auth.routes.ts` (register/login, JWT issuance, bcrypt hashing) + `middleware/authenticate.ts`
  4. `middleware/authorize.ts` (role check) + `middleware/requireEventOwner.ts` (ownership check) — built and unit-tested as their own middleware before any route uses them
  5. `events.service.ts` + `events.controller.ts` + `events.routes.ts` (full CRUD, wired to authenticate/authorize/requireEventOwner as appropriate per route)
  6. `bookings.service.ts` (atomic seat-decrement transaction + outbox insert) + `bookings.controller.ts` + `bookings.routes.ts`
  7. `tests/integration/booking.concurrency.test.ts` — written and passing **before** moving to the queue layer; the concurrency guarantee must be proven at the DB-transaction level first, independent of the queue
  8. `queue/connection.ts` + `queue/queues.ts` — confirm a single manual `queue.add()` + a minimal worker logging the payload works end-to-end before building the real workers
  9. `queue/outboxPoller.ts` — wired to the real queues, verified it picks up a manually-inserted outbox row and marks it processed
  10. `queue/workers/bookingConfirmation.worker.ts` and `queue/workers/eventUpdateNotification.worker.ts` (built and tested separately, since they depend on different queries)
  11. Wire event-update route's outbox insert (job_type = EVENT_UPDATE_NOTIFICATION) — this was deferred until the worker exists, per rule below
  12. End-to-end manual test: register both roles, create event, book from two "simultaneous" terminals, update event, confirm both console-log jobs fire correctly, cancel a booking, confirm seats released
* **Do not skip ahead.** If asked to jump to the queue/worker layer before the concurrency test in step 7 passes, flag this back rather than building workers against an unverified booking transaction.

## 1B. Phase 2 Execution Protocol (Frontend & Payments)
* **Build order (fixed, do not reorder):**
  1. `frontend/` scaffolding + `index.css` Neobrutalism design tokens + React Router setup.
  2. Auth UI (Login/Register pages) + centralized `api.ts` fetch wrapper for JWT handling.
  3. Layout/Routing (Nav bar, protected routes).
  4. Backend DB migration (add `price` to Event).
  5. Stripe Backend Endpoints (Checkout session creation + Webhook handler). Tested with Stripe CLI test-mode webhook forwarding before proceeding.
  6. Customer Features (Event discovery, Booking flow initiating Stripe Checkout, My Tickets view).
  7. Organizer Features (Dashboard, Event create/edit forms).
  8. Polish (Micro-animations, E2E manual walkthrough).

## 2. Verification at Every Stage (non-negotiable)
* After each service/controller pair is written: run its tests immediately. Do not proceed to the next build-order step until they pass.
* After the bookings transaction is written: manually run the concurrency test (parallel requests) and inspect the actual `availableSeats` value and booking rows in Postgres directly — not just the test's pass/fail — before trusting the guarantee.
* After `queue/connection.ts` + a throwaway manual job: confirm a job actually round-trips through real Redis (add → worker picks up → logs) before wiring `outboxPoller.ts` to it.
* After the full flow is wired: run the manual end-to-end scenario in step 12 above and inspect actual console output for both job types before declaring Phase 1 done.
* The full test suite must pass with zero failures before any step is marked complete in `progress-tracker.md`.

## 3. Simplicity Discipline (actively resist overengineering)
* Do not introduce GraphQL, microservices, a generic pub/sub abstraction beyond the two named job types, or a second database in this phase. The stack defined in `architecture.md` is final for Phase 1 — if a task seems to need something else, stop and flag it rather than adding it silently.
* Do not add configuration options, feature flags, or generalized "notification channel" abstractions for scenarios that aren't part of the current task (e.g. don't build a pluggable email-provider interface — it's a `console.log`, per spec, until told otherwise).
* If a simpler implementation achieves the same guarantee (concurrency safety, idempotency, durability) without new infra, prefer it. The goal is a correct, demoable, defensible backend — not architectural sophistication for its own sake.

## 4. Do Not Guess
* If an exact BullMQ retry/backoff count, JWT expiry duration, password-hashing cost factor, or outbox-poller interval is unspecified, stop and ask rather than inventing a value silently — these are exactly the kind of detail that looks fine in a demo and falls apart under interview questioning ("why 3 attempts and not 5?").
* If a task references a layer or file that doesn't exist yet per the build order in Section 1, stop and flag it instead of creating a stub.
* The ORM choice (Prisma) and the exact severity of "what counts as a notify-worthy event update" (all fields vs. only time/venue/cancellation) are currently assumptions/open questions in `progress-tracker.md` — confirm before building the affected step, don't silently resolve them mid-implementation.

## 5. Refactoring & Code Modification
* Never delete or placeholder existing working code with comments like `// rest stays the same` — rewrite the full file if a change is needed.
* Any change to `bookings.service.ts` (the concurrency-critical transaction) or `queue/outboxPoller.ts` (the durability chokepoint) must be called out explicitly, since correctness guarantees depend on both — re-run the concurrency test and the outbox durability test after touching either file, not just whatever test prompted the change.

## 6. End of Every Work Session
* Update `progress-tracker.md`: what's Completed, what's In Progress, what's Next, and any Open Questions that came up (e.g. "should event-update notification fire on every field change or only material ones like time/venue/cancellation").
