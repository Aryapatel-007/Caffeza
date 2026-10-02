import { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useDeviceSettings } from '../features/printing/useDeviceSettings.js';
import { useAuth } from './AuthContext.jsx';

/**
 * The look on this device. P20A, DESIGN-SYSTEM-V2 sections 4, 11 and 13.
 *
 * Sets four things on the root element, which every token in index.css reads:
 * `data-theme` (day or night), `--accent` and `--accent-night` from the
 * restaurant's `settings.appearance`, `data-density` and `data-text-size`.
 *
 * Automatic is Night on the kitchen screen and Day everywhere else. Before
 * sign-in it is Ocean and Day.
 *
 * UNTIL P20B, ONLY THE SCREENS ALREADY ON VERSION 2 FOLLOW A NIGHT SETTING.
 * The back office still draws with version 1 colours that only exist in day,
 * so it would be unreadable at night. P20B moves it and removes this list.
 */
const V2_ROUTES = ['/floor', '/orders', '/kitchen', '/bills', '/cash', '/day-close', '/accounts', '/payouts', '/tables/arrange', '/device'];

const isV2Route = (pathname) => V2_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const ThemeContext = createContext({ theme: 'day', secondLanguage: 'NONE' });

export function themeFor(setting, pathname) {
  if (!isV2Route(pathname)) return 'day';
  if (setting === 'DAY') return 'day';
  if (setting === 'NIGHT') return 'night';
  return pathname === '/kitchen' || pathname.startsWith('/kitchen/') ? 'night' : 'day';
}

export function ThemeProvider({ children }) {
  const { pathname } = useLocation();
  const { user, features } = useAuth();
  const [device] = useDeviceSettings();

  const appearance = user ? features.appearance : null;
  const theme = themeFor(device.theme, pathname);
  const secondLanguage = device.secondLanguage ?? appearance?.secondLanguage ?? 'NONE';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = device.density === 'COMPACT' ? 'compact' : 'comfortable';
    root.dataset.textSize = String(device.textSize ?? 100);
  }, [theme, device.density, device.textSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (appearance?.accent && appearance?.accentNight) {
      root.style.setProperty('--accent', appearance.accent);
      root.style.setProperty('--accent-night', appearance.accentNight);
    } else {
      // Ocean, from index.css.
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-night');
    }
  }, [appearance?.accent, appearance?.accentNight]);

  const value = useMemo(() => ({ theme, secondLanguage }), [theme, secondLanguage]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
