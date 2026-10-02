/**
 * Report date presets, and the range remembered per report. P18.
 *
 * "Today" is the current business date from `businessDateToday()`, never the
 * calendar date: at 12:30 AM the cafe is still in yesterday's business day.
 * All arithmetic is on business-date labels, in utils/formatDate.js.
 */
import { businessDateBefore, businessDateToday, endOfMonth, startOfMonth, startOfWeek } from '../../utils/formatDate.js';

export const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];

/** `{ from, to }` for a preset, as of today's business date. */
export function presetRange(key, today = businessDateToday()) {
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = businessDateBefore(today, 1);
      return { from: day, to: day };
    }
    case 'thisWeek':
      return { from: startOfWeek(today), to: today };
    case 'last7':
      return { from: businessDateBefore(today, 6), to: today };
    case 'thisMonth':
      return { from: startOfMonth(today), to: today };
    case 'lastMonth': {
      const lastDay = businessDateBefore(startOfMonth(today), 1);
      return { from: startOfMonth(lastDay), to: endOfMonth(lastDay) };
    }
    default:
      return null;
  }
}

/** The preset a range matches, or 'custom'. */
export function presetOf({ from, to }) {
  const match = PRESETS.find((preset) => {
    const range = presetRange(preset.key);
    return range.from === from && range.to === to;
  });
  return match?.key ?? 'custom';
}

const storageKey = (name) => `report-range:${name}`;

/** The last range used for a report on this device, or null. */
export function rememberedRange(name) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(name)) ?? 'null');
    return stored?.from && stored?.to ? stored : null;
  } catch {
    return null;
  }
}

export function rememberRange(name, range) {
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(range));
  } catch {
    // A private window or blocked storage: the default range is used next time.
  }
}
