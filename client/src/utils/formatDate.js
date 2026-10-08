/**
 * Date and time display, client side.
 *
 * The server stores and sends UTC. This file is the only place on the client
 * that turns that into something a person reads. Not in a component, ever.
 * One screen that forgets to convert will show 2:30am for an 8:00am shift, and
 * once one number is wrong nobody trusts the rest of them either.
 *
 * The server mirror of this is server/utils/time.js.
 */

/**
 * India Standard Time.
 *
 * Hardcoded rather than read from configuration, because the browser has no
 * access to the server environment and every user of this product is in India.
 * If that ever changes, it changes here.
 */
export const DISPLAY_TIMEZONE = 'Asia/Kolkata';

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(value, options) {
  const date = toDate(value);
  if (date === null) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: DISPLAY_TIMEZONE, ...options }).format(date);
}

/** Date and time together. 28 Aug 2026, 8:29 pm */
export function toIst(value) {
  return format(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Date only. 28 Aug 2026 */
export function formatDateIst(value) {
  return format(value, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * A business date label, "2026-09-26", shown as "26 Sep 2026". A business date
 * is a label, not an instant, so it is read at midday India time, which no
 * time zone can push onto another day. P09.
 */
export function formatBusinessDate(businessDate) {
  if (!businessDate) return '';
  return formatDateIst(`${businessDate}T12:00:00+05:30`);
}

/** Time only. 8:29 pm */
export function formatTimeIst(value) {
  return format(value, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** The weekday, in full. Saturday. P23, for the spoken booking alert. */
export function formatWeekdayIst(value) {
  return format(value, { weekday: 'long' });
}

/** Weekday and date, short. Sat 10 Oct. P23, for a booking's day. */
export function formatDayIst(value) {
  return format(value, { weekday: 'short', day: 'numeric', month: 'short' });
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A UTC instant to the "YYYY-MM-DDTHH:mm" a <input type="datetime-local"> wants,
 * in IST. Editing a timestamp is still turning UTC into something a person
 * reads, so it lives here and not in a component.
 */
export function toDatetimeLocalIst(value) {
  const date = toDate(value);
  if (date === null) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * The reverse: a "YYYY-MM-DDTHH:mm" typed as IST wall-clock, back to a UTC ISO
 * string for the API. IST is a fixed +5:30, so this needs no timezone library.
 */
export function fromDatetimeLocalIst(local) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? '');
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS).toISOString();
}

/* ------------------------------------------------------------------------- *
 * THE BUSINESS DAY, client mirror.
 *
 * A line-for-line copy of `businessDateFor` in server/utils/time.js, which is
 * the one rule for which business day an instant belongs to. This is a copy of
 * that rule, not a second one: it MUST stay identical, and
 * server/tests/timeDisplay.test.js runs both against the same instants to
 * prove it.
 *
 * Why it exists: every list the cashier and the manager filter by date filters
 * by business date. Defaulting to today's calendar date meant that at 12:30 AM,
 * with the cafe still billing yesterday's business day, the bills list showed
 * nothing at all.
 *
 * The client assumes the default 05:00 start, because cashiers cannot read
 * `GET /settings`. A restaurant that moves its start will see default dates
 * off by one around the boundary; see the known problems table.
 * ------------------------------------------------------------------------- */

/** Minutes past midnight IST at which the business day rolls over. 05:00. */
export const DEFAULT_BUSINESS_DAY_START_MINUTES = 300;

/** IST is UTC+05:30. India does not observe daylight saving, so this is fixed. */
const IST_OFFSET_MINUTES = 330;
const MINUTE_MS = 60_000;

/** The business day an instant belongs to, as a "YYYY-MM-DD" string. */
export function businessDateForIst(instant, startMinutes = DEFAULT_BUSINESS_DAY_START_MINUTES) {
  const value = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(value.getTime())) {
    throw new TypeError('businessDateForIst received a value that is not a valid date.');
  }

  const shifted = new Date(value.getTime() + (IST_OFFSET_MINUTES - startMinutes) * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}

/** Today's business date. The default for every date filter on a list screen. */
export function businessDateToday(startMinutes = DEFAULT_BUSINESS_DAY_START_MINUTES) {
  return businessDateForIst(new Date(), startMinutes);
}

/** The business date `days` after a label. P23, for the booking date list. */
export function businessDateAfter(businessDate, days = 1) {
  return businessDateBefore(businessDate, -days);
}

/**
 * The business date `days` before a "YYYY-MM-DD" label. Label arithmetic on
 * the calendar, read in UTC so no time zone can move it. P10.
 */
export function businessDateBefore(businessDate, days = 1) {
  const [year, month, day] = businessDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------
 * Business-date label arithmetic for report date presets. P18.
 *
 * All of it on "YYYY-MM-DD" labels, read in UTC, so no time zone can move a
 * date. A business date is a label, not an instant.
 * ------------------------------------------------------------------------- */

const labelParts = (businessDate) => businessDate.split('-').map(Number);
const label = (year, monthIndex, day) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

/** The Monday of the week a business date falls in. Weeks run Monday to Sunday. */
export function startOfWeek(businessDate) {
  const [year, month, day] = labelParts(businessDate);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return label(year, month - 1, day - weekday);
}

/** The first day of the month a business date falls in. */
export function startOfMonth(businessDate) {
  const [year, month] = labelParts(businessDate);
  return label(year, month - 1, 1);
}

/** The last day of the month a business date falls in. */
export function endOfMonth(businessDate) {
  const [year, month] = labelParts(businessDate);
  return label(year, month, 0);
}
