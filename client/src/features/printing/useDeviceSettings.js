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

/** P20A, DESIGN-SYSTEM section 11b. */
export const THEMES = Object.freeze(['AUTO', 'DAY', 'NIGHT']);
export const DENSITIES = Object.freeze(['COMFORTABLE', 'COMPACT']);
export const TEXT_SIZES = Object.freeze([100, 115, 130]);

const DEFAULTS = Object.freeze({
  paperMm: 80,
  autoPrintKots: false,
  kitchenStationId: null,
  printedKotIds: [],
  // Automatic is Day everywhere, the kitchen included. Night is chosen per device.
  theme: 'AUTO',
  density: 'COMFORTABLE',
  textSize: 100,
  // null follows the restaurant's `settings.appearance.secondLanguage`.
  secondLanguage: null,
});

/** Same-tab listeners. The `storage` event only reaches other tabs. */
const CHANGE_EVENT = 'caffeza-device-change';

/** What this tab last wrote, for a browser that refuses storage. */
let lastWritten = null;

function read() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return { ...DEFAULTS, ...(stored ?? lastWritten ?? {}) };
  } catch {
    return { ...DEFAULTS, ...(lastWritten ?? {}) };
  }
}

function write(settings) {
  lastWritten = settings;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private window can refuse storage. The settings just do not stick.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
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
    const onChange = () => setSettings(read());
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  // Reads the stored settings rather than this hook's copy, so two screens
  // using the hook never overwrite each other's change.
  const update = useCallback((change) => {
    const current = read();
    const next = { ...current, ...(typeof change === 'function' ? change(current) : change) };
    setSettings(next);
    write(next);
  }, []);

  return [settings, update];
}

/** Adds ids to the printed list, keeping only the most recent ones. */
export function rememberPrinted(printedKotIds, ids) {
  const merged = [...printedKotIds.filter((id) => !ids.includes(id)), ...ids];
  return merged.slice(-PRINTED_KOT_MEMORY);
}
