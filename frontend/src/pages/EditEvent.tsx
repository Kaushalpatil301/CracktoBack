import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';
import EventForm from '../components/EventForm';
import { EventData } from '../components/EventCard';

export default function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ event: EventData }>(`/events/${id}`)
      .then((data) => {
        setEvent(data.event);
      })
      .catch((err: any) => {
        setError((err as ApiError).message || 'Failed to load event for editing');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="neo-flex-center neo-page-min-height"><h2>Loading event...</h2></div>;
  }

  if (error || !event) {
    return <div className="neo-error-banner">{error || 'Event not found'}</div>;
  }

  return (
    <div>
      <EventForm initialData={event} isEdit={true} />
    </div>
  );
}
