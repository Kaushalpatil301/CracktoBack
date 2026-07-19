import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users } from 'lucide-react';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { EventData } from '../components/EventCard';

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    
    // We pass organizerId to filter only this organizer's events
    apiFetch<{ events: EventData[] }>(`/events?organizerId=${user.id}&limit=100`)
      .then((data) => {
        setEvents(data.events);
      })
      .catch((err: any) => {
        setError((err as ApiError).message || 'Failed to load your events');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  const handleDelete = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to cancel this event? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiFetch(`/events/${eventId}`, { method: 'DELETE' });
      setEvents((prev) => prev.filter(e => e.id !== eventId));
    } catch (err: any) {
      alert((err as ApiError).message || 'Failed to cancel event');
    }
  };

  if (loading) {
    return <div className="neo-flex-center neo-page-min-height"><h2>Loading dashboard...</h2></div>;
  }

  return (
    <div>
      <div className="neo-flex-between neo-mb-4">
        <h2>My Events</h2>
        <Link to="/organizer/events/new" className="neo-btn">Create Event</Link>
      </div>

      {error ? (
        <div className="neo-error-banner">{error}</div>
      ) : events.length === 0 ? (
        <div className="neo-card">
          <h3>You haven't created any events yet.</h3>
          <p>Click "Create Event" to get started.</p>
        </div>
      ) : (
        <div className="neo-grid">
          {events.map((event) => {
            const date = new Date(event.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
            const priceFormatted = event.price > 0 ? `$${(event.price / 100).toFixed(2)}` : 'FREE';

            return (
              <div key={event.id} className="neo-card">
                <div className="neo-flex-between">
                  <span className="neo-tag">{priceFormatted}</span>
                </div>
                
                <h3 className="neo-mt-4">{event.title}</h3>
                <p className="neo-text-muted">{event.description}</p>
                
                <div className="neo-card-details">
                  <div className="neo-icon-text">
                    <Calendar size={18} />
                    <span>{date}</span>
                  </div>
                  <div className="neo-icon-text">
                    <MapPin size={18} />
                    <span>{event.venue}</span>
                  </div>
                  <div className="neo-icon-text">
                    <Users size={18} />
                    <span>{event.availableSeats} / {event.totalSeats} seats available</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <Link to={`/organizer/events/${event.id}/edit`} className="neo-btn neo-w-full">
                    Edit Event
                  </Link>
                  <button onClick={() => handleDelete(event.id)} className="neo-btn neo-btn-black neo-w-full">
                    Cancel Event
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
