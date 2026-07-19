import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { prisma } from '../config/db';
import { NotFoundError, ValidationError, InsufficientSeatsError, ConflictError } from '../types/errors';
import type { AuthedRequest } from '../types/express';

const router = Router();

// POST /payments/create-checkout-session
// Requires Authentication, Customer role
router.post(
  '/create-checkout-session',
  authenticate,
  authorize('CUSTOMER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authedReq = req as AuthedRequest;
      const { eventId, seats, idempotencyKey } = req.body;
      const customerId = authedReq.user.id;

      if (!eventId || !seats || !idempotencyKey) {
        throw new ValidationError('eventId, seats, and idempotencyKey are required');
      }

      // Check event existence and availability BEFORE sending to Stripe
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        throw new NotFoundError('Event not found');
      }

      if (event.availableSeats < seats) {
        throw new InsufficientSeatsError();
      }

      // Verify the user hasn't already used this idempotencyKey
      const existingBooking = await prisma.booking.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      });
      if (existingBooking) {
        throw new ConflictError('Booking already processed with this idempotency key');
      }

      // Create Mock Checkout URL
      // We pass the data in the URL query string so the frontend mock page knows what to display/process
      const mockCheckoutUrl = new URL('http://localhost:5173/mock-checkout');
      mockCheckoutUrl.searchParams.append('eventId', eventId);
      mockCheckoutUrl.searchParams.append('seats', seats.toString());
      mockCheckoutUrl.searchParams.append('idempotencyKey', idempotencyKey);
      mockCheckoutUrl.searchParams.append('customerId', customerId);
      mockCheckoutUrl.searchParams.append('totalPrice', (event.price * seats).toString());

      res.status(200).json({ url: mockCheckoutUrl.toString() });
    } catch (err) {
      next(err);
    }
  }
);

export { router as paymentRoutes };
