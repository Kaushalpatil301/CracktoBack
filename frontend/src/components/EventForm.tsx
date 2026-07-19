import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';
import { EventData } from './EventCard';

interface EventFormProps {
  initialData?: EventData;
  isEdit?: boolean;
}

export default function EventForm({ initialData, isEdit }: EventFormProps) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // For native datetime-local input, we need "YYYY-MM-DDThh:mm" format.
  const formatDatetimeLocal = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    // Adjust for timezone offset so it looks correct locally in the input
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    venue: initialData?.venue || '',
    startTime: formatDatetimeLocal(initialData?.startTime),
    totalSeats: initialData?.totalSeats || 50,
    price: initialData ? initialData.price / 100 : 10.00, // convert cents to dollars for UI
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        ...formData,
        totalSeats: parseInt(formData.totalSeats as any, 10),
        price: Math.round(parseFloat(formData.price as any) * 100), // convert dollars to cents
        startTime: new Date(formData.startTime).toISOString(),
      };

      if (isEdit && initialData) {
        // totalSeats cannot be changed on edit per backend rules
        const { totalSeats, ...updatePayload } = payload;
        await apiFetch(`/events/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(updatePayload),
        });
      } else {
        await apiFetch('/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      
      navigate('/organizer/dashboard');
    } catch (err: any) {
      setError((err as ApiError).message || 'Failed to save event');
      setLoading(false);
    }
  };

  return (
    <div className="neo-card neo-max-w-600 neo-mx-auto">
      <h2>{isEdit ? 'Edit Event' : 'Create New Event'}</h2>
      
      {error && <div className="neo-error-banner neo-mt-4">{error}</div>}

      <form onSubmit={handleSubmit} className="neo-mt-4">
        <div className="neo-mt-4">
          <label className="neo-label" htmlFor="title">Title</label>
          <input 
            type="text" 
            id="title" 
            name="title"
            className="neo-input" 
            required
            value={formData.title}
            onChange={handleChange}
          />
        </div>

        <div className="neo-mt-4">
          <label className="neo-label" htmlFor="description">Description</label>
          <textarea 
            id="description" 
            name="description"
            className="neo-input" 
            rows={4}
            required
            value={formData.description}
            onChange={handleChange}
          />
        </div>

        <div className="neo-mt-4">
          <label className="neo-label" htmlFor="venue">Venue</label>
          <input 
            type="text" 
            id="venue" 
            name="venue"
            className="neo-input" 
            required
            value={formData.venue}
            onChange={handleChange}
          />
        </div>

        <div className="neo-mt-4">
          <label className="neo-label" htmlFor="startTime">Start Time</label>
          <input 
            type="datetime-local" 
            id="startTime" 
            name="startTime"
            className="neo-input" 
            required
            value={formData.startTime}
            onChange={handleChange}
          />
        </div>

        <div className="neo-grid-2-col neo-mt-4">
          <div>
            <label className="neo-label" htmlFor="price">Price ($)</label>
            <input 
              type="number" 
              id="price" 
              name="price"
              className="neo-input" 
              step="0.01"
              min="0.01"
              required
              value={formData.price}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="neo-label" htmlFor="totalSeats">Total Seats</label>
            <input 
              type="number" 
              id="totalSeats" 
              name="totalSeats"
              className="neo-input" 
              min="1"
              required
              value={formData.totalSeats}
              onChange={handleChange}
              disabled={isEdit} // Backend prevents editing totalSeats
            />
            {isEdit && <small className="neo-text-muted">Cannot change capacity after creation</small>}
          </div>
        </div>

        <button type="submit" className="neo-btn neo-w-full neo-mt-4" disabled={loading}>
          {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
        </button>
      </form>
    </div>
  );
}
