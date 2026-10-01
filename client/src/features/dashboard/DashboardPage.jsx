import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCurrentUser } from '../../api/authApi.js';
import Button from '../../components/ui/Button.jsx';
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
  const { logout, user, features } = useAuth();

  // P02. A switched-off module's links are hidden. The server refuses its
  // endpoints with FEATURE_DISABLED whatever this shows.
  const inventoryOn = features.inventory !== false;
  const attendanceOn = features.attendance !== false;

  const canManageStaff = user?.role === 'OWNER' || user?.role === 'MANAGER';

  /**
   * The kitchen and the storekeeper do not take orders, so the floor is not
   * offered to them. They still reach the kitchen display, which everyone does.
   * Both of these are conveniences; the server is what refuses the endpoints.
   */
  const canTakeOrders = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'].includes(user?.role);

  /** M3. The till: creating a bill, taking payment, discounting, voiding. */
  const canBill = ['OWNER', 'MANAGER', 'CASHIER'].includes(user?.role);

  /**
   * M7. Owner only, matching the screen's own route guard. A manager may read
   * settings on the server but there is only one settings screen and it is a
   * form, so offering it to someone whose every save would 403 helps nobody.
   */
  const canEditSettings = user?.role === 'OWNER';

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

  return (
    <main className="min-h-full bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {profile?.restaurant?.name ?? 'Restaurant ERP'}
          </h1>
          {profile?.branch && <p className="text-sm text-slate-500">{profile.branch.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/*
            Shown only to the roles that can use it. This is a convenience, not
            a permission: the server refuses the staff endpoints to anyone else
            whether or not this link is on screen.
          */}
          {canTakeOrders && (
            <Link
              to="/floor"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Floor
            </Link>
          )}
          {/* Whoever is at the pass marks food ready, so this is not gated. */}
          <Link
            to="/kitchen"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Kitchen
          </Link>
          {canBill && (
            <Link
              to="/bills"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Bills
            </Link>
          )}
          {/* P09. Money: On Hold accounts for the till, payouts for the back office. */}
          {canBill && (
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Money
            </span>
          )}
          {canBill && (
            <Link
              to="/accounts"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              On Hold
            </Link>
          )}
          {canBill && (
            <Link
              to="/cash"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cash drawer
            </Link>
          )}
          {canManageStaff && (
            <Link
              to="/day-close"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Day Close
            </Link>
          )}
          {canManageStaff && (
            <Link
              to="/payouts"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Payouts
            </Link>
          )}
          {/* All six may read stock, so this is gated only by the feature switch. */}
          {inventoryOn && (
            <Link
              to="/inventory"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Stock
            </Link>
          )}
          {/* M6. Reports are back-office reads for the two roles who run the place. */}
          {canManageStaff && (
            <Link
              to="/reports"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reports
            </Link>
          )}
          {canManageStaff && (
            <Link
              to="/tables"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Tables
            </Link>
          )}
          {canEditSettings && (
            <Link
              to="/settings"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Settings
            </Link>
          )}
          {/* All six roles may mark a dish out of stock, so this is not gated. */}
          <Link
            to="/menu/availability"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Availability
          </Link>
          {canManageStaff && (
            <Link
              to="/menu"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Menu
            </Link>
          )}
          {canManageStaff && (
            <Link
              to="/staff"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Staff
            </Link>
          )}
          {/* All roles clock their own shift and read their own hours. */}
          {attendanceOn && (
            <Link
              to="/attendance"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Clock
            </Link>
          )}
          {attendanceOn && (
            <Link
              to="/attendance/me"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              My hours
            </Link>
          )}
          {attendanceOn && canManageStaff && (
            <Link
              to="/attendance/register"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Attendance
            </Link>
          )}
          {canManageStaff && (
            <Link
              to="/stations"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Stations
            </Link>
          )}
          {/* P05. Printer width and auto-print for this computer or tablet. */}
          <Link
            to="/device"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            This device
          </Link>
          <Button variant="secondary" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      {/* P10. Yesterday traded and was not closed. */}
      {canManageStaff && <UnclosedDayWarning />}

      <div className="p-6">
        {/* Loading and error states are required on every screen that calls
            the API. A blank screen during a Friday rush looks broken. */}
        {isLoading && <Spinner label="Loading your details" />}

        {error && <ErrorMessage error={error} />}

        {profile && !isLoading && (
          <dl className="max-w-md space-y-4 rounded-lg bg-white p-6 ring-1 ring-slate-200">
            <div>
              <dt className="text-sm text-slate-500">Signed in as</dt>
              <dd className="text-base font-medium text-slate-900">{profile.user.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Role</dt>
              <dd className="text-base font-medium text-slate-900">{profile.user.role}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Restaurant</dt>
              <dd className="text-base font-medium text-slate-900">{profile.restaurant.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Branch</dt>
              <dd className="text-base font-medium text-slate-900">{profile.branch?.name ?? '-'}</dd>
            </div>
          </dl>
        )}
      </div>
    </main>
  );
}
