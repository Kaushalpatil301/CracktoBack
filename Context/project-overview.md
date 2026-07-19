# Project Overview

## 1. Vision & Objectives
* **Product Name:** EventBook (working name)
* **Elevator Pitch:** A role-based event booking backend where Organizers publish and manage events, Customers browse and book tickets, and every booking/update triggers a reliable, non-blocking background notification — with zero double-booking under concurrent load, even at the last seat.
* **Core Value Proposition:** Most booking-system demos handle the happy path but fall over under concurrency (double-booked seats) or couple notification latency to request latency. This build proves the opposite: correct under race conditions, and notifications never block the API response.

## 2. Scope for Phase 2 (Frontend & Payments)
Phase 1 established the backend core. Phase 2 builds upon it to deliver a complete product experience:
* **Frontend:** React + Vite single-page application.
* **Design System:** Neobrutalism (thick borders, hard drop shadows, high-contrast flat colors, bold typography) defined centrally via CSS variables.
* **Payments:** Stripe Checkout (test mode only) for ticket purchases.
* **Booking Flow (Updated):** Customer initiates booking → Backend creates Stripe Checkout Session → Customer redirected to Stripe → Webhook (`checkout.session.completed`) fires → Atomic seat decrement + booking insert occurs.

## 3. Target Audience
* Primary user: Event organizers and customers utilizing the web interface.
* Need addressed: Provide a full-stack, visually distinct (Neobrutalist) booking experience while proving out robust webhook-driven payment processing without compromising the zero-double-booking backend guarantee.

## 4. Core Features (Phase 2)
1. **Frontend App** — Vite/React scaffold with token-driven CSS architecture.
2. **Auth UI** — Login and Registration views.
3. **Event Browser & Dashboard** — Public event listing and Organizer-specific management portals.
4. **Stripe Integration** — Backend checkout session generation and webhook handling.
5. **Reserve-on-Webhook-Only Booking** — Seats are not decremented until the Stripe webhook confirms payment. If the event sells out during checkout, the webhook catches the `InsufficientSeatsError` and issues a Stripe refund automatically (no seats are held/stuck indefinitely).

## 5. Core User Flow (Phase 2)
* **Flow 1 (Organizer manages events):** Organizer logs in via UI → Navigates to Dashboard → Creates/Edits event (now requiring a `price` field) → API processes write.
* **Flow 2 (Customer books tickets with Payment):** Customer browses to Event page → Selects seats → Clicks "Checkout" → Redirected to Stripe hosted page → Customer pays → Stripe Webhook hits backend → Backend atomically reserves seats and triggers outbox email.
* **Flow 3 (Sold-out Race Condition):** Customer A and Customer B both open Stripe Checkout for the last seat. Customer A pays first. Customer B pays seconds later. Customer A's webhook decrements the seat. Customer B's webhook attempts to decrement, fails (0 rows affected), and immediately issues a Stripe Refund, notifying Customer B they were too late.

## 6. Explicitly Out of Scope (Phase 2)
* Live mode real-money Stripe transactions (Test mode only).
* Complex seat maps or interactive SVG venue pickers.
* Waitlists or multi-tenant (org-level) accounts.
