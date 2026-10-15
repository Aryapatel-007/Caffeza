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
/** P42. The kitchen login sees the ticket board and nothing else. */
const KITCHEN_ONLY_PATH = '/kitchen';

/** `bare`: the screen draws its own page, outside the ERP's frame (P51, the owner's dashboard). */
export default function ProtectedRoute({ children, bare = false }) {
  const { isAuthenticated, isRestoring, user } = useAuth();
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

  // P42. Any other address, Home included, opens the kitchen board for the kitchen login.
  if (user?.role === 'KITCHEN' && location.pathname !== KITCHEN_ONLY_PATH) {
    return <Navigate to={KITCHEN_ONLY_PATH} replace />;
  }

  return bare ? children : <AppShell>{children}</AppShell>;
}
