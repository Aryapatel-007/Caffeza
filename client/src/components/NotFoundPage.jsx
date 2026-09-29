import { Link } from 'react-router-dom';

import EmptyState from './ui/EmptyState.jsx';

/**
 * The catch-all route.
 *
 * Not inside /features, because it does not belong to a module. Every module
 * can land here.
 */
export default function NotFoundPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <EmptyState
          title="Page not found"
          description="That link does not go anywhere. It may have been renamed, or typed slightly wrong."
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
