import { createContext, useContext, useEffect, useMemo } from 'react';

import { useDeviceSettings } from '../features/printing/useDeviceSettings.js';
import { useAuth } from './AuthContext.jsx';

/**
 * The look on this device. P20A, DESIGN-SYSTEM sections 4, 11 and 13.
 *
 * Sets four things on the root element, which every token in index.css reads:
 * `data-theme` (day or night), `--accent` and `--accent-night` from the
 * restaurant's `settings.appearance`, `data-density` and `data-text-size`.
 *
 * Automatic is Day on every screen, the kitchen included (the owner's call,
 * 2 October 2026). A device that wants Night chooses it on This device. Before
 * sign-in it is Ocean and Day.
 */
const ThemeContext = createContext({ theme: 'day', secondLanguage: 'NONE' });

export function themeFor(setting) {
  return setting === 'NIGHT' ? 'night' : 'day';
}

export function ThemeProvider({ children }) {
  const { user, features } = useAuth();
  const [device] = useDeviceSettings();

  const appearance = user ? features.appearance : null;
  // Before sign-in: Ocean and Day, whatever this device is set to.
  const theme = user ? themeFor(device.theme) : 'day';
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
