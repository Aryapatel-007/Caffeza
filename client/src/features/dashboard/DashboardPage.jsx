import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';


import { getCurrentUser } from '../../api/authApi.js';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import UnclosedDayWarning from '../settlement/UnclosedDayWarning.jsx';

/**
 * Dashboard. Still a placeholder.
 *
 * It shows who is signed in and where, read live from GET /auth/me rather than
 * from the token, so a role changed five minutes ago shows here. The real
 * dashboard is M6, built once orders, bills and attendance produce data.
 */
export default function DashboardPage() {
  const { user } = useAuth();

  const canManageStaff = user?.role === 'OWNER' || user?.role === 'MANAGER';

  /**
   * The kitchen and the storekeeper do not take orders, so the floor is not
   * offered to them. They still reach the kitchen display, which everyone does.
   * Both of these are conveniences; the server is what refuses the endpoints.
   */
  const canTakeOrders = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'].includes(user?.role);

  /** M3. The till: creating a bill, taking payment, discounting, voiding. */
  const canBill = ['OWNER', 'MANAGER', 'CASHIER'].includes(user?.role);

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getCurrentUser();
        if (!cancelled) setProfile(data);
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = profile?.user?.name ? `Hello, ${profile.user.name.split(' ')[0]}` : 'Hello';

  // The shortcuts for the work done most. The sidebar has every other place.
  const actions = [
    { to: '/floor', title: 'Tables', note: 'Open or continue an order', show: canTakeOrders, primary: true },
    { to: '/orders/takeaway', title: 'Takeaway', note: 'Counter order', show: canTakeOrders },
    { to: '/orders/delivery', title: 'Delivery', note: 'Zomato or Swiggy', show: canTakeOrders },
    { to: '/bills', title: 'Bills', note: 'Collect payment', show: canBill },
    { to: '/kitchen', title: 'Kitchen', note: 'Tickets at the pass', show: true },
    { to: '/day-close', title: 'Day Close', note: 'Count the cash and lock the day', show: canManageStaff },
    { to: '/reports', title: 'Reports', note: 'Sales, GST and payments', show: canManageStaff },
    { to: '/menu/availability', title: 'Availability', note: 'Mark a dish out', show: true },
  ].filter((action) => action.show);

  return (
    <main className="min-h-full bg-paper">
      {/* P10. Yesterday traded and was not closed. */}
      {canManageStaff && <UnclosedDayWarning />}

      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:p-8">
        {isLoading && <Spinner label="Loading your details" />}
        {error && <ErrorMessage error={error} />}

        <section className="rounded-2xl bg-white p-6 shadow-card lg:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
            {profile?.restaurant?.name ?? 'Caffeza'}
            {profile?.branch ? ` · ${profile.branch.name}` : ''}
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-10 tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-steel">
            {profile?.user?.role ? `Signed in as ${profile.user.role.toLowerCase()}.` : ''}
          </p>
        </section>

        <section aria-label="Shortcuts" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={[
                'flex min-h-[112px] flex-col justify-between rounded-2xl p-5 shadow-card transition active:scale-[0.98]',
                action.primary ? 'bg-chana text-ink' : 'bg-white text-ink hover:bg-linen',
              ].join(' ')}
            >
              <span className="text-lg font-semibold">{action.title}</span>
              <span className={action.primary ? 'text-sm text-ink/75' : 'text-sm text-steel'}>
                {action.note}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
