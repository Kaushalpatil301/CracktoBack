/**
 * api.ts
 *
 * Centralized fetch wrapper for the frontend.
 * Automatically attaches the JWT (if it exists) to every outgoing request.
 * Normalizes error responses so components can consistently catch and display them.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface ApiError {
  code: string;
  message: string;
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('jwt_token');
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (data && data.error) {
      throw data.error as ApiError;
    }
    throw { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' } as ApiError;
  }

  return data as T;
}
