import { useCallback, useEffect, useState } from 'react';

/**
 * Settings that belong to this device, not to a user or the restaurant. P05.
 *
 * The cashier's computer has an 80mm printer whoever signs in, and a station
 * tablet prints its own tickets. So paper width, auto-print and the kitchen
 * screen's chosen station live in this browser's localStorage, under one key,
 * read through this one hook.
 *
 * Nothing here is security or money. Losing it costs a click to set again.
 */
const STORAGE_KEY = 'caffeza.device';

/** How many printed KOT ids to remember, so a refresh never prints twice. */
export const PRINTED_KOT_MEMORY = 500;

const DEFAULTS = Object.freeze({
  paperMm: 80,
  autoPrintKots: false,
  kitchenStationId: null,
  printedKotIds: [],
});

function read() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(settings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private window can refuse storage. The settings just do not stick.
  }
}

/**
 * Returns `[settings, update]`. `update` takes a partial object, or a function
 * of the current settings, and saves the result on the device.
 */
export function useDeviceSettings() {
  const [settings, setSettings] = useState(read);

  // Another tab on the same device changing a setting is picked up here.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setSettings(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((change) => {
    setSettings((current) => {
      const next = { ...current, ...(typeof change === 'function' ? change(current) : change) };
      write(next);
      return next;
    });
  }, []);

  return [settings, update];
}

/** Adds ids to the printed list, keeping only the most recent ones. */
export function rememberPrinted(printedKotIds, ids) {
  const merged = [...printedKotIds.filter((id) => !ids.includes(id)), ...ids];
  return merged.slice(-PRINTED_KOT_MEMORY);
}
