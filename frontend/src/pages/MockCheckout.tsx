import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function MockCheckout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventId = searchParams.get('eventId');
  const seats = searchParams.get('seats');
  const idempotencyKey = searchParams.get('idempotencyKey');
  const customerId = searchParams.get('customerId');
  const totalPrice = searchParams.get('totalPrice');

  if (!eventId || !seats || !idempotencyKey || !customerId || !totalPrice) {
    return (
      <div className="neo-card neo-max-w-600 neo-mx-auto neo-mt-4">
        <h2>Invalid Checkout URL</h2>
        <p>Missing required parameters for the mock checkout.</p>
        <button onClick={() => navigate(-1)} className="neo-btn neo-mt-4">Go Back</button>
      </div>
    );
  }

  const handleApprove = async () => {
    setProcessing(true);
    setError(null);
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await fetch('http://localhost:3000/webhook/mock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventId,
          seats,
          idempotencyKey,
          customerId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Webhook failed');
      }

      // Success - redirect to tickets
      navigate('/my-tickets?success=true');
    } catch (err: any) {
      setError(err.message || 'Payment approval failed.');
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    navigate('/?canceled=true');
  };

  const formattedTotal = `$${(parseInt(totalPrice, 10) / 100).toFixed(2)}`;

  return (
    <div className="neo-card neo-max-w-600 neo-mx-auto neo-mt-4">
      <div className="neo-checkout-header">
        <h2 className="neo-mb-0">🔒 Secure Mock Checkout</h2>
        <p className="neo-text-muted neo-mb-0">Test Mode</p>
      </div>
      
      <div className="neo-mt-4">
        <h3>Order Summary</h3>
        <div className="neo-flex-between neo-mt-4">
          <span>Tickets ({seats})</span>
          <span className="neo-text-bold">{formattedTotal}</span>
        </div>
        <div className="neo-flex-between neo-checkout-total">
          <span className="neo-text-bold">Total Due:</span>
          <span className="neo-text-hero neo-text-2xl">{formattedTotal}</span>
        </div>
      </div>

      {error && <div className="neo-error-banner neo-mt-4">{error}</div>}

      <div className="neo-mt-4 neo-form">
        <button 
          onClick={handleApprove} 
          className="neo-btn neo-btn-large" 
          disabled={processing}
        >
          {processing ? 'Processing...' : `Approve Payment for ${formattedTotal}`}
        </button>
        <button 
          onClick={handleCancel} 
          className="neo-btn neo-btn-secondary"
          disabled={processing}
        >
          Cancel Order
        </button>
      </div>
    </div>
  );
}
