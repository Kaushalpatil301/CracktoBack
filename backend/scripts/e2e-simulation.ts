/**
 * scripts/e2e-simulation.ts
 *
 * Automated simulation of the Step 12 manual test.
 * Assumes the server is running on http://localhost:3000 (npm run dev).
 *
 * Scenario:
 * 1. Register Organizer & Customer
 * 2. Organizer creates an Event (10 seats)
 * 3. Customer makes 2 concurrent bookings of 6 seats each -> one succeeds, one fails (409)
 *    -> Observe [Worker:BookingConfirmation] console log in the server terminal
 * 4. Organizer updates the Event
 *    -> Observe [Worker:EventUpdate] console log in the server terminal
 * 5. Customer cancels their 6-seat booking
 * 6. Verify seats are back to 10.
 */

import fetch from 'node-fetch';

const API = 'http://localhost:3000';

async function req(method: string, path: string, token?: string, body?: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function main() {
  console.log('── EventBook End-to-End Simulation ──\n');

  // 1. Register
  console.log('1. Registering users...');
  const orgRes = await req('POST', '/auth/register', undefined, {
    name: 'E2E Organizer',
    email: `org-${Date.now()}@test.com`,
    password: 'password123',
    role: 'ORGANIZER',
  });
  const orgToken = orgRes.data.token;

  const custRes = await req('POST', '/auth/register', undefined, {
    name: 'E2E Customer',
    email: `cust-${Date.now()}@test.com`,
    password: 'password123',
    role: 'CUSTOMER',
  });
  const custToken = custRes.data.token;
  console.log('   ✅ Users registered');

  // 2. Create Event
  console.log('\n2. Organizer creating event (10 seats)...');
  const eventRes = await req('POST', '/events', orgToken, {
    title: 'E2E Test Event',
    description: 'Testing the whole flow',
    venue: 'Simulation Arena',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    totalSeats: 10,
  });
  const eventId = eventRes.data.event.id;
  console.log(`   ✅ Event created (ID: ${eventId})`);

  // 3. Concurrent Bookings (6 seats each)
  console.log('\n3. Customer attempts 2 concurrent bookings of 6 seats each (requires 12 total, only 10 available)...');
  console.log('   [Check your server terminal for the BOOKING_CONFIRMATION email log!]');
  
  const [book1, book2] = await Promise.all([
    req('POST', `/events/${eventId}/bookings`, custToken, { seats: 6 }, { 'Idempotency-Key': 'b1' }),
    req('POST', `/events/${eventId}/bookings`, custToken, { seats: 6 }, { 'Idempotency-Key': 'b2' }),
  ]);

  console.log(`   Booking 1 returned HTTP ${book1.status}`);
  console.log(`   Booking 2 returned HTTP ${book2.status}`);
  
  const successBooking = book1.status === 201 ? book1 : (book2.status === 201 ? book2 : null);
  const failedBooking = book1.status === 409 ? book1 : (book2.status === 409 ? book2 : null);
  
  if (successBooking && failedBooking) {
    console.log('   ✅ Concurrency held! One succeeded, one failed.');
  } else {
    console.error('   ❌ Concurrency failed! Did not get one 201 and one 409.');
  }

  const bookingId = successBooking?.data.booking.id;

  // 4. Update Event
  console.log('\n4. Organizer updates the event venue...');
  console.log('   [Check your server terminal for the EVENT_UPDATE_NOTIFICATION bulk email log!]');
  await req('PUT', `/events/${eventId}`, orgToken, { venue: 'Moved to New Arena' });
  console.log('   ✅ Event updated');

  // Wait a moment for workers
  await new Promise(r => setTimeout(r, 2000));

  // 5. Cancel Booking
  console.log('\n5. Customer cancels their booking...');
  await req('DELETE', `/bookings/${bookingId}`, custToken);
  console.log('   ✅ Booking cancelled');

  // 6. Verify Seats
  console.log('\n6. Verifying available seats restored to 10...');
  const finalEventRes = await req('GET', `/events/${eventId}`);
  const finalSeats = finalEventRes.data.event.availableSeats;
  console.log(`   Available Seats: ${finalSeats}`);
  if (finalSeats === 10) {
    console.log('   ✅ Seats restored correctly');
  } else {
    console.error('   ❌ Seats not restored correctly!');
  }

  console.log('\n🎉 E2E Simulation Complete!');
}

main().catch(console.error);
