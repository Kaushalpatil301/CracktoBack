import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/');
    setTimeout(() => {
      logout();
    }, 10);
  };

  return (
    <div className="neo-container">
      <header className="neo-header">
        <Link to="/" className="neo-link-reset">
          <h1>EventBook</h1>
        </Link>
        <nav className="neo-nav">
          {user ? (
            <>
              {user.role === 'ORGANIZER' && (
                <Link to="/organizer/dashboard" className="neo-btn">Dashboard</Link>
              )}
              {user.role === 'CUSTOMER' && (
                <Link to="/my-tickets" className="neo-btn">My Tickets</Link>
              )}
              <span className="neo-text-bold-center">Hi, {user.name}</span>
              <button onClick={handleLogout} className="neo-btn neo-btn-secondary">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="neo-btn">Login</Link>
              <Link to="/register" className="neo-btn neo-btn-secondary">Register</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        {/* Render child routes here */}
        <Outlet />
      </main>
    </div>
  );
}
