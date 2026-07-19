import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Users, Share2 } from 'lucide-react';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { EventData } from '../components/EventCard';

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [seats, setSeats] = useState(1);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ event: EventData }>(`/events/${id}`)
      .then((data) => {
        setEvent(data.event);
      })
      .catch((err: any) => {
        setError((err as ApiError).message || 'Failed to load event details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleBook = async () => {
    if (!event) return;
    if (!user) {
      navigate('/login', { state: { from: `/events/${id}` } });
      return;
    }

    if (user.role !== 'CUSTOMER') {
      setBookingError('Only customers can book tickets.');
      return;
    }

    setBookingError(null);
    setIsBooking(true);

    try {
      const idempotencyKey = crypto.randomUUID();
      const searchParams = new URLSearchParams({
        eventId: id as string,
        seats: seats.toString(),
        idempotencyKey,
        customerId: user.id,
        totalPrice: (event.price * seats).toString()
      });

      // Redirect directly to the mock checkout page (free gateway)
      navigate(`/mock-checkout?${searchParams.toString()}`);
    } catch (err: any) {
      setBookingError((err as ApiError).message || 'Failed to initiate booking');
      setIsBooking(false);
    }
  };

  const handleShare = async () => {
    if (!event) return;
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          url: url,
        });
      } catch (err) {
        // User cancelled share or failed
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert('Event link copied to clipboard!');
      } catch (err) {
        alert('Failed to copy link');
      }
    }
  };

  if (loading) {
    return <div className="neo-flex-center neo-page-min-height"><h2>Loading event...</h2></div>;
  }

  if (error || !event) {
    return <div className="neo-error-banner">{error || 'Event not found'}</div>;
  }

  const date = new Date(event.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const priceFormatted = event.price > 0 ? `$${(event.price / 100).toFixed(2)}` : 'FREE';
  const totalPrice = event.price > 0 ? `$${((event.price * seats) / 100).toFixed(2)}` : 'FREE';

  return (
    <div className="neo-grid-2-col">
      {/* Left Column: Event Details */}
      <div>
        <div className="neo-flex-between">
          <span className="neo-tag">{priceFormatted} per seat</span>
          {event.availableSeats <= 0 && (
            <span className="neo-tag neo-tag-black">SOLD OUT</span>
          )}
        </div>

        <div className="neo-flex-between neo-mt-4" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 className="neo-text-hero neo-mb-0">{event.title}</h1>
          <button onClick={handleShare} className="neo-btn neo-btn-black" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}>
            <Share2 size={20} /> Share
          </button>
        </div>
        
        <div className="neo-card-details neo-mt-4">
          <div className="neo-icon-text neo-text-xl">
            <Calendar size={24} />
            <span>{date}</span>
          </div>
          <div className="neo-icon-text neo-text-xl">
            <MapPin size={24} />
            <span>{event.venue}</span>
          </div>
        </div>

        <div className="neo-card neo-mt-4">
          <h3>About this event</h3>
          <p className="neo-mt-4 neo-text-pre-wrap">{event.description}</p>
        </div>
      </div>

      {/* Right Column: Booking Card */}
      <div>
        <div className="neo-card neo-sticky">
          <h3>Get Tickets</h3>
          
          <div className="neo-icon-text neo-mt-4">
            <Users size={20} />
            <span>{event.availableSeats} / {event.totalSeats} seats available</span>
          </div>

          <div className="neo-mt-4">
            <label className="neo-label" htmlFor="seats">Number of Seats</label>
            <input 
              id="seats"
              type="number" 
              className="neo-input" 
              value={seats}
              onChange={(e) => setSeats(Math.max(1, Math.min(event.availableSeats, parseInt(e.target.value) || 1)))}
              min="1"
              max={event.availableSeats}
              disabled={event.availableSeats <= 0}
            />
          </div>

          <div className="neo-flex-between neo-mt-4">
            <span className="neo-text-bold">Total:</span>
            <span className="neo-text-bold neo-text-xl">{totalPrice}</span>
          </div>

          {bookingError && (
            <div className="neo-error-banner neo-mt-4">
              {bookingError}
            </div>
          )}

          <button 
            className="neo-btn neo-w-full neo-mt-4" 
            onClick={handleBook}
            disabled={event.availableSeats <= 0 || isBooking}
          >
            {isBooking ? 'Redirecting to Checkout...' : event.availableSeats <= 0 ? 'Sold Out' : 'Checkout'}
          </button>
        </div>
      </div>
    </div>
  );
}
