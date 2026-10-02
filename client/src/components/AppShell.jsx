import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { formatDateIst, formatTimeIst } from '../utils/formatDate.js';

/**
 * The frame around every signed-in screen: a sidebar of places to go, and a
 * thin top bar with the date, the time and who is signed in.
 *
 * Links are conveniences, not permissions. The server refuses each endpoint to
 * the wrong role whether or not a link is drawn, and a switched-off feature is
 * hidden here the same way the dashboard used to hide it.
 */
const FULL_SCREEN_PATHS = ['/attendance'];

function useNavItems() {
  const { user, features } = useAuth();
  const role = user?.role;
  const manager = role === 'OWNER' || role === 'MANAGER';
  const till = manager || role === 'CASHIER';
  const floor = till || role === 'WAITER';
  const inventoryOn = features.inventory !== false;
  const attendanceOn = features.attendance !== false;

  const groups = [
    {
      title: 'Service',
      items: [
        { to: '/dashboard', label: 'Home', show: true },
        { to: '/floor', label: 'Tables', show: floor },
        { to: '/orders/takeaway', label: 'Takeaway', show: floor },
        { to: '/orders/delivery', label: 'Delivery', show: floor },
        { to: '/kitchen', label: 'Kitchen', show: true },
        { to: '/bills', label: 'Bills', show: till },
        { to: '/menu/availability', label: 'Availability', show: true },
      ],
    },
    {
      title: 'Money',
      items: [
        { to: '/accounts', label: 'On Hold', show: till },
        { to: '/cash', label: 'Cash drawer', show: till },
        { to: '/day-close', label: 'Day Close', show: manager },
        { to: '/payouts', label: 'Payouts', show: manager },
        { to: '/reports', label: 'Reports', show: manager },
      ],
    },
    {
      title: 'Set up',
      items: [
        { to: '/menu', label: 'Menu', show: manager },
        { to: '/tables', label: 'Table setup', show: manager },
        { to: '/stations', label: 'Stations', show: manager },
        { to: '/inventory', label: 'Stock', show: inventoryOn },
        { to: '/staff', label: 'Staff', show: manager },
        { to: '/attendance/register', label: 'Attendance', show: attendanceOn && manager },
        { to: '/attendance/me', label: 'My hours', show: attendanceOn },
        { to: '/settings', label: 'Settings', show: role === 'OWNER' },
        { to: '/device', label: 'This device', show: true },
      ],
    },
  ];
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.show) }))
    .filter((group) => group.items.length > 0);
}

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboard' || to === '/bills' || to === '/menu'}
      className={({ isActive }) =>
        [
          'flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition-colors',
          isActive
            ? 'bg-chana text-ink shadow-card'
            : 'text-steel hover:bg-linen-3 hover:text-ink',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-sm font-semibold">{formatDateIst(now)} · {formatTimeIst(now)}</span>;
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const groups = useNavItems();

  if (FULL_SCREEN_PATHS.includes(pathname)) return children;

  return (
    <div className="flex h-full bg-paper">
      <aside className="hidden w-64 shrink-0 flex-col justify-between overflow-y-auto bg-linen px-3 py-5 lg:flex print:!hidden">
        <div>
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-chana text-lg font-bold text-ink shadow-card">
              C
            </div>
            <div className="leading-tight">
              <p className="text-xl font-semibold tracking-tight">Caffeza</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
                Point of sale
              </p>
            </div>
          </div>
          <nav aria-label="Main" className="space-y-5">
            {groups.map((group) => (
              <div key={group.title}>
                <p className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavItem key={item.to} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-6 rounded-xl bg-white p-3 shadow-card">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="text-xs text-steel">{user?.role}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-2 h-10 w-full rounded-full bg-linen-2 text-sm font-semibold hover:bg-linen-3"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto print:overflow-visible">
        <header className="flex items-center justify-between gap-3 bg-paper/90 px-4 py-3 shadow-[0_1px_8px_rgba(28,27,25,0.04)] lg:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-chana text-sm font-bold">
              C
            </span>
            <span className="truncate font-semibold">Caffeza</span>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-linen-2 px-3 py-1.5 lg:flex">
            <span className="size-2 rounded-full bg-patta" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-patta">
              Signed in
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-linen px-3 py-1.5">
              <Clock />
            </div>
            <button
              type="button"
              onClick={logout}
              className="h-9 rounded-full bg-linen-2 px-4 text-sm font-semibold hover:bg-linen-3 lg:hidden"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Narrow screens have no sidebar, so the places to go scroll along the top. */}
        <nav
          aria-label="Main"
          className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1 lg:hidden print:hidden"
        >
          {groups.flatMap((group) => group.items).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold',
                  isActive ? 'bg-chana text-ink' : 'bg-linen-2 text-steel',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
