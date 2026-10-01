import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import AppShell from './AppShell.jsx';
import Spinner from './ui/Spinner.jsx';

/**
 * Sends a signed-out visitor to the login screen.
 *
 * This is a convenience, not security. It stops a logged-out user from landing
 * on a screen that will only show them errors. Anyone can edit the JavaScript
 * running in their own browser and walk straight past it.
 *
 * What actually protects data is the server: every endpoint checks the token,
 * the role, and the restaurantId on every request. If a screen is reachable
 * but the API says no, the API wins. That is the correct outcome.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isRestoring } = useAuth();
  const location = useLocation();

  if (isRestoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed, so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <AppShell>{children}</AppShell>;
}
