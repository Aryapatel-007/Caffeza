import { Navigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';

/**
 * Keeps a screen out of the way of people it is not for.
 *
 * This is convenience only. It is not security, and it must never be the
 * reason something is safe. Anyone can edit the JavaScript running in their own
 * browser and route themselves straight here.
 *
 * What actually stops a cashier managing staff is the server: every one of
 * those endpoints runs requireRole(OWNER, MANAGER) and answers 403 regardless
 * of what the browser thinks. This component exists so a cashier is not shown
 * a screen that would only give them errors.
 */
export default function RequireRole({ roles, children }) {
  const { user, isRestoring } = useAuth();

  if (isRestoring) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return children;
}
