/**
 * When the public page takes takeaway orders and bookings. P23 (M14).
 *
 * Pure functions over `settings.online` and the business day start. Which
 * business date an instant belongs to is still decided only by
 * `businessDateFor`; this file only turns opening and closing minutes into
 * instants for a given business date.
 *
 * The rule: on business date D the cafe opens at D's `opensAtMinutes` in India
 * time, and closes at `closesAtMinutes` the same day, or the next day when the
 * closing time is not after the opening time (a cafe that closes at 1 AM).
 */
import { addDaysToDate, businessDateFor, istWallClockToUtc } from '../utils/time.js';

const MINUTE_MS = 60_000;

/** The opening window of one business date, as two UTC instants. */
export function openingWindow(businessDate, online) {
  const opensAt = istWallClockToUtc(businessDate, online.opensAtMinutes);
  const closeMinutes =
    online.closesAtMinutes > online.opensAtMinutes ? online.closesAtMinutes : online.closesAtMinutes + 1440;
  return { opensAt, closesAt: istWallClockToUtc(businessDate, closeMinutes) };
}

/**
 * The window an instant falls in, or null when the cafe is closed then.
 *
 * Checks the instant's own business date and the one before, because a cafe
 * that closes after the business day rolls over is still serving the earlier
 * date's window.
 */
export function windowContaining(instant, online, dayStartMinutes) {
  const date = businessDateFor(instant, dayStartMinutes);
  for (const candidate of [date, addDaysToDate(date, -1)]) {
    const window = openingWindow(candidate, online);
    if (instant >= window.opensAt && instant < window.closesAt) return { businessDate: candidate, ...window };
  }
  return null;
}

/**
 * Takeaway pickup bounds right now: the earliest is now plus the lead time,
 * the latest is closing. Null when the cafe is closed, or will close before
 * the earliest pickup.
 */
export function pickupBounds(now, online, dayStartMinutes) {
  const window = windowContaining(now, online, dayStartMinutes);
  if (!window) return null;
  const earliest = new Date(now.getTime() + online.takeawayMinLeadMinutes * MINUTE_MS);
  if (earliest > window.closesAt) return null;
  return { businessDate: window.businessDate, earliestPickupAt: earliest, latestPickupAt: window.closesAt };
}

/**
 * The times a booking may be requested for on a business date: every slot
 * from opening until the hold length before closing, later than now plus the
 * lead time.
 */
export function reservationSlots(businessDate, now, online) {
  const { opensAt, closesAt } = openingWindow(businessDate, online);
  const lastStart = closesAt.getTime() - online.reservationHoldMinutes * MINUTE_MS;
  const earliest = now.getTime() + online.takeawayMinLeadMinutes * MINUTE_MS;
  const step = online.reservationSlotMinutes * MINUTE_MS;

  const slots = [];
  for (let at = opensAt.getTime(); at <= lastStart; at += step) {
    if (at >= earliest) slots.push(new Date(at));
  }
  return slots;
}

/** The business dates a guest may book: today and the next `reservationDaysAhead` days. */
export function bookableDates(now, online, dayStartMinutes) {
  const today = businessDateFor(now, dayStartMinutes);
  return { first: today, last: addDaysToDate(today, online.reservationDaysAhead) };
}
