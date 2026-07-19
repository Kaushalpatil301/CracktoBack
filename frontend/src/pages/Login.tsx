import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch, ApiError } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await apiFetch<{ token: string, user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      login(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError((err as ApiError).message || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="neo-flex-center neo-page-min-height">
      <div className="neo-card neo-auth-card">
        <h2>Login</h2>
        
        {error && (
          <div className="neo-error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="neo-form">
          <div>
            <label className="neo-label" htmlFor="email">Email</label>
            <input 
              id="email"
              type="email" 
              className="neo-input" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div>
            <label className="neo-label" htmlFor="password">Password</label>
            <input 
              id="password"
              type="password" 
              className="neo-input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="neo-btn neo-mt-4" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
