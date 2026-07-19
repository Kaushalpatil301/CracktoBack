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

export default function MyTickets() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = async () => {
    try {
      const data = await apiFetch<{ bookings: Booking[] }>('/bookings/me');
      setBookings(data.bookings);
    } catch (err: any) {
      setError((err as ApiError).message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiFetch(`/bookings/${bookingId}`, { method: 'DELETE' });
      // Refresh the list after cancellation
      fetchBookings();
    } catch (err: any) {
      alert((err as ApiError).message || 'Failed to cancel booking');
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
      ) : bookings.length === 0 ? (
        <div className="neo-card">
          <h3>No tickets found.</h3>
          <p>Head to the homepage to discover great events!</p>
        </div>
      ) : (
        <div className="neo-grid">
          {bookings.map((booking) => {
            const date = new Date(booking.event.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            const priceFormatted = booking.totalPrice > 0 ? `$${(booking.totalPrice / 100).toFixed(2)}` : 'FREE';

            return (
              <div key={booking.id} className="neo-card">
                <div className="neo-flex-between">
                  <span className="neo-tag">{booking.status}</span>
                  <span className="neo-text-bold">{priceFormatted}</span>
                </div>
                
                <h3 className="neo-mt-4">{booking.event.title}</h3>
                
                <div className="neo-card-details neo-mt-4">
                  <div className="neo-icon-text">
                    <Calendar size={18} />
                    <span>{date}</span>
                  </div>
                  <div className="neo-icon-text">
                    <MapPin size={18} />
                    <span>{booking.event.venue}</span>
                  </div>
                  <div className="neo-icon-text">
                    <Ticket size={18} />
                    <span>{booking.seats} seat(s) booked</span>
                  </div>
                </div>

                {booking.status !== 'CANCELLED' && (
                  <button 
                    className="neo-btn neo-w-full neo-mt-4 neo-btn-black" 
                    onClick={() => handleCancel(booking.id)}
                  >
                    <XCircle size={18} className="neo-mr-2" /> Cancel Booking
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
