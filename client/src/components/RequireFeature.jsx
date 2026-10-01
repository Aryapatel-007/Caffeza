import { Link } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import EmptyState from './ui/EmptyState.jsx';

const FEATURE_LABELS = {
  inventory: 'Inventory',
  attendance: 'Attendance',
};

/**
 * Keeps a switched-off module's screens out of reach (P02).
 *
 * Someone who opens one by its address sees a plain sentence saying the
 * feature is off and who can switch it on, with a way back. Not a blank page,
 * and not an error box: nothing went wrong.
 *
 * Convenience only. Every one of these screens' endpoints is refused with 403
 * FEATURE_DISABLED by requireFeature on the server whatever this shows.
 */
export default function RequireFeature({ feature, children }) {
  const { features, isRestoring } = useAuth();

  if (isRestoring) return null;
  if (features?.[feature] !== false) return children;

  const label = FEATURE_LABELS[feature] ?? 'This feature';

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <EmptyState
          title={`${label} is switched off`}
          description={`${label} is switched off for this restaurant. An owner can switch it on in Settings.`}
          action={
            <Link
              to="/dashboard"
              className="text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
            >
              Back to the dashboard
            </Link>
          }
        />
      </div>
    </main>
  );
}
