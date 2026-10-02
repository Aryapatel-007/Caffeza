import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeProvider.jsx';
import BrandLogo from './ui/BrandLogo.jsx';
import {
  BagIcon,
  CashIcon,
  ChartIcon,
  DeviceIcon,
  FloorIcon,
  HomeIcon,
  KitchenIcon,
  LockIcon,
  MenuBookIcon,
  MoreIcon,
  ReceiptIcon,
  ScooterIcon,
  SignOutIcon,
} from './ui/icons/index.jsx';
import Sheet from './ui/Sheet.jsx';

/**
 * The frame around every signed-in screen. DESIGN-SYSTEM sections 8a and 9.
 *
 * Under 600px: a top bar with the wordmark, and a bottom bar with the role's
 * main places and More. From 600px: a 76px rail on the left with the same
 * places. Chosen by width, never by device type. More opens a sheet with every
 * other place this person may go, and sign out.
 *
 * Links are conveniences, not permissions. The server refuses each endpoint to
 * the wrong role whether or not a link is drawn, and a switched-off feature is
 * hidden here the same way.
 */
const FULL_SCREEN_PATHS = ['/attendance'];

/** The service screens of DESIGN-SYSTEM section 8a. Everything else is back office. */
const SERVICE_PATHS = ['/floor', '/orders', '/bills', '/kitchen'];
const isServicePath = (pathname) => SERVICE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const PLACES = {
  home: { to: '/dashboard', label: 'Home', Icon: HomeIcon },
  floor: { to: '/floor', label: 'Floor', Icon: FloorIcon },
  takeaway: { to: '/orders/takeaway', label: 'Takeaway', Icon: BagIcon },
  delivery: { to: '/orders/delivery', label: 'Delivery', Icon: ScooterIcon },
  kitchen: { to: '/kitchen', label: 'Kitchen', Icon: KitchenIcon },
  bills: { to: '/bills', label: 'Bills', Icon: ReceiptIcon },
  cash: { to: '/cash', label: 'Cash', Icon: CashIcon },
  dayClose: { to: '/day-close', label: 'Day Close', Icon: LockIcon },
  reports: { to: '/reports', label: 'Reports', Icon: ChartIcon },
  availability: { to: '/menu/availability', label: 'Availability', Icon: MenuBookIcon },
  stock: { to: '/inventory', label: 'Stock', Icon: MenuBookIcon },
};

/** Each role's four main places, in the order they are used. */
const MAIN_BY_ROLE = {
  OWNER: ['floor', 'bills', 'kitchen', 'reports'],
  MANAGER: ['floor', 'bills', 'kitchen', 'dayClose'],
  CASHIER: ['floor', 'bills', 'takeaway', 'cash'],
  WAITER: ['floor', 'takeaway', 'delivery', 'kitchen'],
  KITCHEN: ['kitchen', 'availability'],
  STOREKEEPER: ['stock', 'availability'],
};

function useMoreGroups() {
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
        { to: '/floor', label: 'Floor', show: floor },
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

function useMainPlaces() {
  const { user, features } = useAuth();
  const keys = MAIN_BY_ROLE[user?.role] ?? ['home'];
  return keys
    .filter((key) => key !== 'stock' || features.inventory !== false)
    .map((key) => PLACES[key]);
}

const isCurrent = (pathname, to) => pathname === to || (to !== '/dashboard' && pathname.startsWith(`${to}/`) && !(to === '/menu' && pathname.startsWith('/menu/availability')));

function PlaceLink({ place, layout }) {
  const { pathname } = useLocation();
  const active = isCurrent(pathname, place.to) || (place.to === '/floor' && pathname.startsWith('/orders/') && !pathname.startsWith('/orders/takeaway') && !pathname.startsWith('/orders/delivery'));
  const Icon = place.Icon;
  return (
    <NavLink
      to={place.to}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-lg transition-colors',
        layout === 'rail' ? 'min-h-14 w-16' : 'min-h-14 flex-1',
        active ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken hover:text-ink',
      ].join(' ')}
    >
      <span className={active ? 'text-accent' : ''}>
        <Icon size={22} />
      </span>
      <span className="type-caption">{place.label}</span>
    </NavLink>
  );
}

function MoreButton({ onClick, layout }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink',
        layout === 'rail' ? 'min-h-14 w-16' : 'min-h-14 flex-1',
      ].join(' ')}
    >
      <MoreIcon size={22} />
      <span className="type-caption">More</span>
    </button>
  );
}

function MoreSheet({ onClose }) {
  const { user, logout } = useAuth();
  const groups = useMoreGroups();
  return (
    <Sheet title="All places" subtitle={user ? `${user.name}` : null} onClose={onClose}>
      <nav aria-label="All places" className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="type-label mb-1 text-muted">{group.title}</p>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    end={item.to === '/menu' || item.to === '/bills'}
                    className={({ isActive }) =>
                      ['type-body flex min-h-12 items-center rounded-lg px-3', isActive ? 'bg-sunken font-semibold' : 'hover:bg-sunken'].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <button type="button" onClick={logout} className="type-button flex min-h-12 items-center gap-2 rounded-lg border border-ink px-4">
          <SignOutIcon />
          Sign out
        </button>
      </nav>
    </Sheet>
  );
}

/**
 * The restaurant's mark in the top bar. P22, DESIGN-SYSTEM section 15.
 *
 * On a phone the logo at 32px. From 600px, on a back-office screen, the logo at
 * 40px; on a service screen the rail carries the square mark instead, so a
 * screen shows the brand once. With no logo, the wordmark as text everywhere,
 * exactly as before: the restaurant's wordmark, then its name, then the
 * product's. A client's name is never written into the product.
 */
function TopBarMark({ isService }) {
  const { brand } = useTheme();
  const hasLogo = Boolean(brand.logos?.LIGHT_GROUND?.dataUrl || brand.logos?.DARK_GROUND?.dataUrl);
  return (
    <>
      <BrandLogo height={32} className="min-[600px]:hidden" />
      {!(isService && hasLogo) && <BrandLogo height={40} className="hidden min-[600px]:flex" />}
    </>
  );
}

/** The square mark at the top of the rail, on a service screen with a logo. */
function RailMark({ isService }) {
  const { brand } = useTheme();
  const hasLogo = Boolean(brand.logos?.LIGHT_GROUND?.dataUrl || brand.logos?.DARK_GROUND?.dataUrl);
  if (!hasLogo || !isService) return null;
  return (
    <NavLink to="/dashboard" className="mb-2 flex min-h-12 items-center justify-center rounded-[10px]">
      <BrandLogo shape="mark" height={44} />
    </NavLink>
  );
}

export default function AppShell({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const places = useMainPlaces();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (FULL_SCREEN_PATHS.includes(pathname)) return children;

  return (
    <div className="v2 flex h-full bg-ground text-ink">
      <nav aria-label="Main" className="hidden w-[76px] flex-none flex-col items-center gap-1 overflow-y-auto border-r border-line bg-surface py-3 min-[600px]:flex print:!hidden">
        <RailMark isService={isServicePath(pathname)} />
        {places.map((place) => (
          <PlaceLink key={place.to} place={place} layout="rail" />
        ))}
        <MoreButton layout="rail" onClick={() => setMoreOpen(true)} />
        <NavLink to="/device" className="mt-auto flex min-h-12 w-16 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label="This device">
          <DeviceIcon />
        </NavLink>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 flex-none items-center justify-between gap-3 border-b border-line bg-surface px-4 print:hidden">
          <TopBarMark isService={isServicePath(pathname)} />
          <span className="type-caption truncate text-muted">{user?.name}</span>
        </header>

        {/* `relative`, so anything absolutely placed inside a screen (screen-reader text,
            tooltips) belongs to this scroll area. Without it such an element was
            placed against the window and gave the page a second scroll. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>

        <nav aria-label="Main" className="flex flex-none items-stretch gap-1 border-t border-line bg-surface px-2 py-1 min-[600px]:hidden print:hidden">
          {places.map((place) => (
            <PlaceLink key={place.to} place={place} layout="bar" />
          ))}
          <MoreButton layout="bar" onClick={() => setMoreOpen(true)} />
        </nav>
      </div>

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
