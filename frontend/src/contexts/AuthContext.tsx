import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ORGANIZER' | 'CUSTOMER';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read token and user data from local storage on mount
    const token = localStorage.getItem('jwt_token');
    const userData = localStorage.getItem('user_data');
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData) as User;
        setUser(parsedUser);
      } catch (e) {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('user_data', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
