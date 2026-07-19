import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users } from 'lucide-react';

export interface EventData {
  id: string;
  title: string;
  description: string;
  venue: string;
  startTime: string;
  totalSeats: number;
  availableSeats: number;
  price: number;
}

interface EventCardProps {
  event: EventData;
}

export default function EventCard({ event }: EventCardProps) {
  const date = new Date(event.startTime).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const priceFormatted = event.price > 0 ? `$${(event.price / 100).toFixed(2)}` : 'FREE';

  return (
    <div className="neo-card">
      <div className="neo-flex-between">
        <span className="neo-tag">{priceFormatted}</span>
        {event.availableSeats <= 0 && (
          <span className="neo-tag neo-tag-black">SOLD OUT</span>
        )}
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

      <Link to={`/events/${event.id}`} className="neo-btn neo-w-full">
        View Details
      </Link>
    </div>
  );
}
