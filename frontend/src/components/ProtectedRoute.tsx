import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  allowedRole?: 'CUSTOMER' | 'ORGANIZER';
}

export default function ProtectedRoute({ allowedRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="neo-flex-center neo-page-min-height"><h2>Loading...</h2></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // If they don't have the right role, bounce them to the home page
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
