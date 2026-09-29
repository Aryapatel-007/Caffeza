/**
 * Minutes past midnight to a clock face, and back.
 *
 * The business day boundary is stored as an integer number of minutes because
 * that is what the server derives every `businessDate` from. An owner should
 * never see 300: they should see 05:00, which is what their day actually starts
 * at. The conversion is here, on the screen that shows it, and the value that
 * travels over the wire is always minutes.
 *
 * This is a time OF DAY, not an instant, so it is deliberately not in
 * utils/formatDate.js: nothing here has a timezone, because 05:00 means 05:00
 * IST by definition and there is no other zone in version 1.
 *
 * Local to M7 because M7 is the only screen showing it. If a second screen ever
 * needs it, it moves to utils/ then, the same way queryBoolean did on the server.
 */

const MINUTES_IN_DAY = 24 * 60;

const pad = (value) => String(value).padStart(2, '0');

/** 300 becomes "05:00", which is what an `<input type="time">` takes. */
export function minutesToClock(minutes) {
  const safe = Number.isInteger(minutes) ? Math.min(Math.max(minutes, 0), MINUTES_IN_DAY - 1) : 0;
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

/**
 * "05:00" becomes 300. Returns null for anything that is not a clock face, so
 * a half-typed value never travels as a number the server would accept.
 */
export function clockToMinutes(clock) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(clock ?? ''));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}
