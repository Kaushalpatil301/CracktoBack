import React, { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../api';
import EventCard, { EventData } from '../components/EventCard';

export default function Home() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Note: since this route is public, we don't strictly need a JWT,
    // but apiFetch will attach it if present.
    apiFetch<{ events: EventData[] }>('/events?limit=20')
      .then((data) => {
        setEvents(data.events);
      })
      .catch((err: any) => {
        setError((err as ApiError).message || 'Failed to load events');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div className="neo-card neo-hero">
        <h2 className="neo-hero-title">Discover and book incredible events.</h2>
        <p className="neo-hero-subtitle">No double bookings. Guaranteed.</p>
      </div>

      {loading ? (
        <div className="neo-flex-center"><h3 className="neo-mt-4">Loading events...</h3></div>
      ) : error ? (
        <div className="neo-error-banner">{error}</div>
      ) : events.length === 0 ? (
        <div className="neo-card">
          <h3>No events found.</h3>
          <p>Check back later for exciting new events!</p>
        </div>
      ) : (
        <div className="neo-grid">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
