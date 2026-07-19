import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, Ticket, XCircle } from 'lucide-react';
import { apiFetch, ApiError } from '../api';

interface Booking {
  id: string;
  seats: number;
  totalPrice: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  event: {
    id: string;
    title: string;
    venue: string;
    startTime: string;
  };
}

interface GroupedBooking {
  event: Booking['event'];
  status: Booking['status'];
  seats: number;
  totalPrice: number;
  bookings: Booking[];
}

export default function MyTickets() {
  const [groupedBookings, setGroupedBookings] = useState<GroupedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      const data = await apiFetch<{ bookings: Booking[] }>('/bookings/me');
      
      const groups = new Map<string, GroupedBooking>();
      
      for (const booking of data.bookings) {
        const key = `${booking.event.id}-${booking.status}`;
        if (!groups.has(key)) {
          groups.set(key, {
            event: booking.event,
            status: booking.status,
            seats: 0,
            totalPrice: 0,
            bookings: [],
          });
        }
        
        const group = groups.get(key)!;
        group.seats += booking.seats;
        group.totalPrice += booking.totalPrice;
        group.bookings.push(booking);
      }
      
      setGroupedBookings(Array.from(groups.values()));
    } catch (err: any) {
      setError((err as ApiError).message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (group: GroupedBooking) => {
    let seatsToCancel = group.seats;

    if (group.seats > 1) {
      const input = window.prompt(
        `You have ${group.seats} tickets for this event. How many would you like to cancel?`, 
        group.seats.toString()
      );
      if (input === null) return;
      
      const parsed = parseInt(input, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > group.seats) {
        alert('Invalid number of tickets.');
        return;
      }
      seatsToCancel = parsed;
    } else {
      if (!window.confirm('Are you sure you want to cancel this ticket? This action cannot be undone.')) {
        return;
      }
    }

    try {
      let remainingToCancel = seatsToCancel;
      for (const booking of group.bookings) {
        if (remainingToCancel <= 0) break;
        
        const cancelForThisBooking = Math.min(booking.seats, remainingToCancel);
        await apiFetch(`/bookings/${booking.id}/cancel`, { 
          method: 'PATCH',
          body: JSON.stringify({ seats: cancelForThisBooking })
        });
        remainingToCancel -= cancelForThisBooking;
      }
      fetchBookings();
    } catch (err: any) {
      alert((err as ApiError).message || 'Failed to cancel booking(s)');
      fetchBookings();
    }
  };

  if (loading) {
    return <div className="neo-flex-center neo-page-min-height"><h2>Loading your tickets...</h2></div>;
  }

  return (
    <div>
      <div className="neo-hero neo-card">
        <h2 className="neo-hero-title">My Tickets</h2>
        <p className="neo-hero-subtitle">Manage your upcoming events</p>
      </div>

      {error ? (
        <div className="neo-error-banner">{error}</div>
      ) : groupedBookings.length === 0 ? (
        <div className="neo-card">
          <h3>No tickets found.</h3>
          <p>Head to the homepage to discover great events!</p>
        </div>
      ) : (
        <div className="neo-grid">
          {groupedBookings.map((group, index) => {
            const date = new Date(group.event.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            const priceFormatted = group.totalPrice > 0 ? `$${(group.totalPrice / 100).toFixed(2)}` : 'FREE';

            return (
              <div key={`${group.event.id}-${group.status}-${index}`} className="neo-card">
                <div className="neo-flex-between">
                  <span className="neo-tag">{group.status}</span>
                  <span className="neo-text-bold">{priceFormatted}</span>
                </div>
                
                <h3 className="neo-mt-4">{group.event.title}</h3>
                
                <div className="neo-card-details neo-mt-4">
                  <div className="neo-icon-text">
                    <Calendar size={18} />
                    <span>{date}</span>
                  </div>
                  <div className="neo-icon-text">
                    <MapPin size={18} />
                    <span>{group.event.venue}</span>
                  </div>
                  <div className="neo-icon-text">
                    <Ticket size={18} />
                    <span>{group.seats} seat(s) booked</span>
                  </div>
                </div>

                {group.status !== 'CANCELLED' && (
                  <button 
                    className="neo-btn neo-w-full neo-mt-4 neo-btn-black" 
                    onClick={() => handleCancel(group)}
                  >
                    <XCircle size={18} className="neo-mr-2" /> Cancel Tickets
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
