/**
 * Shows an online screen only while online orders are switched on. P23.
 * A convenience: the server refuses every /online endpoint with
 * FEATURE_DISABLED whatever this says.
 */
import { Link } from 'react-router-dom';

import EmptyState from '../../components/ui/EmptyState.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function RequireOnline({ children }) {
  const { features, isRestoring } = useAuth();
  if (isRestoring) return null;
  if (features.online?.enabled) return children;
  return (
    <main className="flex min-h-full items-center justify-center bg-sunken p-6">
      <div className="w-full max-w-md">
        <EmptyState
          title="Online orders are switched off"
          description="An owner can switch them on in Settings, under Online orders and bookings."
          action={
            <Link to="/dashboard" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
              Back to Home
            </Link>
          }
        />
      </div>
    </main>
  );
}
