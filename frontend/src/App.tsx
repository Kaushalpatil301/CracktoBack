import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import EventDetails from './pages/EventDetails';
import OrganizerDashboard from './pages/OrganizerDashboard';
import CreateEvent from './pages/CreateEvent';
import EditEvent from './pages/EditEvent';
import MyTickets from './pages/MyTickets';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public Routes without the MainLayout (Auth Pages) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Routes wrapped in the MainLayout */}
        <Route element={<MainLayout />}>
          {/* Publicly accessible Home Page */}
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventDetails />} />

          {/* Protected Customer Routes */}
          <Route element={<ProtectedRoute allowedRole="CUSTOMER" />}>
            <Route path="/my-tickets" element={<MyTickets />} />
          </Route>

          {/* Protected Organizer Routes */}
          <Route element={<ProtectedRoute allowedRole="ORGANIZER" />}>
            <Route path="/organizer/dashboard" element={<OrganizerDashboard />} />
            <Route path="/organizer/events/new" element={<CreateEvent />} />
            <Route path="/organizer/events/:id/edit" element={<EditEvent />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
