# System Architecture

## 1. Tech Stack (locked — do not swap without updating this file)
* **Language:** Node.js 20+, TypeScript (strict mode on)
* **API Framework:** Express
* **Validation:** Zod — every request body/params/query parsed through a Zod schema before it reaches a controller; no unvalidated `req.body` access anywhere
* **ORM:** Prisma (schema-first migrations, generated types) — with one deliberate exception: the seat-decrement write goes through `prisma.$transaction` using a raw parameterized `UPDATE ... WHERE available_seats >= $1` so the lock semantics are exact and auditable, not hidden behind ORM abstraction
* **Database:** PostgreSQL 15+
* **Background jobs:** Redis + BullMQ (real queue + worker processes, not an in-memory stand-in — this was an explicit choice for this phase over the in-process alternative)
* **Job durability pattern:** Transactional outbox — an `outbox_events` row is written in the *same* Postgres transaction as the business write (booking / event update); a separate poller relays unprocessed outbox rows into BullMQ and marks them processed. This is what guarantees a job is never lost even if the process crashes between DB commit and queue enqueue.
* **Auth:** JWT (`jsonwebtoken`), `bcrypt` for password hashing
* **Testing:** Jest + Supertest (API/integration), a dedicated concurrency test hitting the booking endpoint with parallel requests against a real Postgres instance
* **Local dev infra:** `docker-compose.yml` running Postgres + Redis only — no additional services
* **Frontend:** React + Vite (TypeScript)
* **Design System:** Neobrutalism (thick 2-4px black borders, hard drop shadows with 0px blur, high-contrast flat colors, bold sans-serif, minimal 0-4px border radius). All tokens defined as CSS variables in `index.css`.
* **Payments:** Stripe Checkout (test mode only)

**Explicitly not used in this phase (avoid overengineering):** GraphQL, microservices/API gateway, Kafka, multiple databases, server-side sessions (JWT is stateless and sufficient), a generic "notification service" abstraction layer beyond the two defined job types.

## 2. Data Flow

```
POST /events (Organizer)                    PUT /events/:id (Organizer, owner-only)
        │                                              │
        ▼                                              ▼
  events.controller  ──────────────────────────  events.controller
        │                                              │
        ▼                                              ▼
  events.service.create()                    events.service.update()
        │  (single Postgres tx)                        │  (single Postgres tx)
        │  1. INSERT/UPDATE events                      │  1. UPDATE events
        │  2. INSERT outbox_events                       │  2. INSERT outbox_events
        │     (job_type = none for create)               │     (job_type = EVENT_UPDATE_NOTIFICATION)
        ▼                                              ▼
   response 201                                   response 200
                                                        │
                                            [async, decoupled from request]
                                                        ▼
                                        outboxPoller (interval, e.g. every 1s)
                                          reads unprocessed outbox_events rows
                                          → queue.add(jobType, payload)
                                          → marks processed_at
                                                        ▼
                                        BullMQ worker: eventUpdateNotification
                                          → SELECT bookings WHERE event_id = X AND status = CONFIRMED
                                          → for each: console.log("Notified customer Y")


POST /events/:id/checkout (Customer)
        │
        ▼
   bookings.controller → stripe.checkout.sessions.create()
        │  NO Postgres DB writes happen here.
        │  Creates a Stripe session holding metadata: { eventId, customerId, seats }
        ▼
   returns { url } → Frontend redirects user to Stripe

Stripe Webhook: checkout.session.completed
        │
        ▼
   webhooks.controller → bookings.service.confirmStripePayment()
        │  single Postgres tx:
        │  1. UPDATE events SET available_seats = available_seats - :n
        │       WHERE id = :eventId AND available_seats >= :n   (atomic conditional update)
        │       → 0 rows affected = insufficient seats → ROLLBACK → triggers Stripe Refund API
        │  2. INSERT INTO bookings (... idempotency_key ...)     (UNIQUE constraint guards retries)
        │  3. INSERT INTO outbox_events (job_type = BOOKING_CONFIRMATION)
        ▼
   response 200 (Stripe)
        │
        ▼ [async]
   outboxPoller → BullMQ → worker: bookingConfirmation
        → console.log("Confirmation email sent to customer X for booking Y")
```

## 3. Data Models (high level — exact Prisma schema defined in code, not here)

* **User:** `id, name, email (unique), passwordHash, role (ORGANIZER | CUSTOMER), createdAt`
* **Event:** `id, organizerId (FK → User), title, description, venue, startTime, totalSeats, availableSeats, price (integer, in cents), updatedAt`
* **Booking:** `id, eventId (FK), customerId (FK), seats, status (CONFIRMED | CANCELLED), idempotencyKey, createdAt` — `UNIQUE(customerId, idempotencyKey)`
* **OutboxEvent:** `id, jobType (BOOKING_CONFIRMATION | EVENT_UPDATE_NOTIFICATION), payload (jsonb), processedAt (nullable), createdAt`

## 4. Core Invariants & Boundaries (must hold always)

* **Every state-changing write to `events` or `bookings` that should trigger a background job writes its outbox row in the *same* transaction.** No route handler ever calls `queue.add()` directly.
* **Seat decrement is never read-then-write in application code.** It is always the single atomic `UPDATE ... WHERE available_seats >= :n` statement inside a transaction.
* **Reserve-on-webhook-only:** Seats are NEVER held while a user is on the Stripe checkout page. Seat decrement and booking row creation happen *only* when the `checkout.session.completed` webhook fires. If the event sells out while the user is typing their card, the webhook decrement fails, and a Stripe refund is issued automatically.
* **Role check and ownership check are separate middleware/steps, always both present on owner-scoped routes.** `authorize('ORGANIZER')` confirms the role; a separate `requireEventOwner` check (loads the event, compares `organizerId` to `req.user.id`) confirms the specific resource. Neither substitutes for the other.
* **Idempotency on booking creation.** Client supplies an `Idempotency-Key` header; it's stored as `idempotencyKey` on the booking row with a unique constraint on `(customerId, idempotencyKey)`. A retried request with the same key returns the original booking (200) rather than creating a duplicate or erroring.
* **Workers never touch the request/response cycle.** Route handlers commit their transaction and return; the outbox poller and BullMQ workers run as separate long-lived processes (or at minimum separate async loops), never awaited by an HTTP handler.
* **No unhandled exceptions cross a worker job into a queue-level failure without classification.** Every worker wraps its job processing in try/catch; on failure it either lets BullMQ's built-in retry/backoff handle it (transient errors) or logs and moves the job to the dead-letter/failed state (permanent errors like a deleted event) — it never crashes the worker process.

## 5. Guardrails Summary

* **Concurrency safety:** atomic conditional UPDATE for seat decrement (see Section 4) — verified by an explicit parallel-request test, not just code review.
* **Idempotency:** unique constraint on `(customerId, idempotencyKey)` for bookings.
* **Job durability:** transactional outbox + poller, so a crash between commit and enqueue cannot silently drop a notification.
* **Job retry:** BullMQ's built-in exponential backoff (documented attempt count in `code-standards.md`), failed jobs land in BullMQ's failed set for inspection rather than disappearing.
* **RBAC:** two-layer check (role + ownership) on every Organizer-scoped route; Customer-scoped routes (`GET /bookings/me`, `DELETE /bookings/:id`) always filter/verify by `req.user.id`, never trust a client-supplied customer ID.
* **Input validation:** every route validated by a Zod schema before the controller runs; invalid input never reaches the service layer.
* **No stack traces to the client:** a single error-handling middleware formats all errors into `{ error: { code, message } }`, logs full detail server-side only.
