import { Router, Request, Response } from 'express';
import { createBooking } from '../services/bookings.service';

const router = Router();

// POST /webhook/mock
router.post('/mock', async (req: Request, res: Response) => {
  const { eventId, customerId, seats, idempotencyKey } = req.body;

  if (!customerId || !eventId || !seats || !idempotencyKey) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    console.log(`[Mock Webhook] Processing booking for Customer ${customerId}, Event ${eventId}, Seats ${seats}`);
    await createBooking({
      eventId,
      customerId,
      seats: parseInt(seats.toString(), 10),
      idempotencyKey,
    });
    console.log(`[Mock Webhook] Booking successful`);
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(`[Mock Webhook] Booking failed:`, err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export { router as webhookRoutes };
