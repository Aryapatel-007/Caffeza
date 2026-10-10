/**
 * Server starts. P30, API-CONTRACT P30 section 3, DB-SCHEMA section 44.
 *
 * Render's free plan stops the server after 15 minutes without a request. A
 * start inside working hours that is not a deploy means the server slept while
 * the restaurant was open, which is what the pingers exist to prevent. This
 * file records each start and reads them back for the owner's Server card.
 *
 * `serverstarts` has no `restaurantId`: it belongs to the server. The
 * restaurant only supplies its business day start and its opening hours.
 */
import { config } from '../config/env.js';
import { SERVER_START_REASONS, ServerStart } from '../models/ServerStart.js';
import { PROCESS_STARTED_AT } from '../utils/processStart.js';
import { addDaysToDate, businessDateFor, minutesBetween, nowUtc } from '../utils/time.js';
import { windowContaining } from './openingHoursService.js';
import { getSettings } from './settingsService.js';

/** A business date with more starts than this inside working hours slept during service. */
export const SLEPT_THRESHOLD = 2;

/** FIRST, DEPLOY or RESTART, against the start before this one. */
export function reasonAgainst(previous, release) {
  if (!previous) return SERVER_START_REASONS.FIRST;
  return (previous.release ?? null) === (release ?? null) ? SERVER_START_REASONS.RESTART : SERVER_START_REASONS.DEPLOY;
}

/**
 * Writes this process's start, once. Called by `startServer` when it begins
 * listening. `startedAt` defaults to when the process started, not to now.
 */
export async function recordServerStart({
  startedAt = PROCESS_STARTED_AT,
  release = config.RELEASE_VERSION,
  nodeEnv = config.NODE_ENV,
} = {}) {
  const previous = await ServerStart.findOne({ startedAt: { $lt: startedAt } })
    .sort({ startedAt: -1 })
    .lean();
  return ServerStart.create({ startedAt, release: release ?? null, nodeEnv, reason: reasonAgainst(previous, release) });
}

/**
 * Working hours as the Server card judges them: the online opening hours while
 * the online page is on, and every hour while it is off, because those times
 * are then only a default nobody chose.
 */
function workingHoursOf(settings) {
  const fromOnlineSettings = Boolean(settings.features?.online);
  return {
    opensAtMinutes: settings.online.opensAtMinutes,
    closesAtMinutes: settings.online.closesAtMinutes,
    fromOnlineSettings,
  };
}

/**
 * Pure: the starts of the last `days` business dates up to `now`, grouped
 * by business date, newest first. `starts` is any list of `{ startedAt,
 * reason }`; only the ones in the range are used.
 */
export function summariseStarts(starts, { now, days, dayStartMinutes, workingHours }) {
  const today = businessDateFor(now, dayStartMinutes);
  const dates = Array.from({ length: days }, (_, index) => addDaysToDate(today, -index));
  const inRange = new Set(dates);

  const isWorking = (instant) =>
    !workingHours.fromOnlineSettings || windowContaining(instant, workingHours, dayStartMinutes) !== null;

  const rows = starts
    .map((start) => ({
      ...start,
      businessDate: businessDateFor(start.startedAt, dayStartMinutes),
    }))
    .filter((start) => inRange.has(start.businessDate))
    .map((start) => ({
      ...start,
      // A deploy is not a sleep.
      inWorkingHours: start.reason === SERVER_START_REASONS.RESTART && isWorking(start.startedAt),
    }))
    .sort((a, b) => b.startedAt - a.startedAt);

  const dayRows = dates.map((businessDate) => {
    const ofDay = rows.filter((start) => start.businessDate === businessDate).sort((a, b) => a.startedAt - b.startedAt);
    let longestGapMinutes = null;
    for (let index = 1; index < ofDay.length; index += 1) {
      const gap = minutesBetween(ofDay[index - 1].startedAt, ofDay[index].startedAt);
      if (longestGapMinutes === null || gap > longestGapMinutes) longestGapMinutes = gap;
    }
    return {
      businessDate,
      starts: ofDay.length,
      startsInWorkingHours: ofDay.filter((start) => start.inWorkingHours).length,
      longestGapMinutes,
    };
  });

  return {
    days: dayRows,
    starts: rows,
    sleptInWorkingHours: dayRows.filter((day) => day.startsInWorkingHours > SLEPT_THRESHOLD).map((day) => day.businessDate),
  };
}

/** GET /system/starts. OWNER only; the route checks the role. */
export async function readServerStarts(req, { days = 7 } = {}) {
  const settings = await getSettings(req.restaurantId, { req });
  const dayStartMinutes = settings.business.businessDayStartsAtMinutes;
  const workingHours = workingHoursOf(settings);
  const now = nowUtc();

  // One day earlier than the range, so a start just after midnight is not missed.
  const since = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);
  const found = await ServerStart.find({ startedAt: { $gte: since } })
    .sort({ startedAt: -1 })
    .lean();

  const summary = summariseStarts(found, { now, days, dayStartMinutes, workingHours });
  return {
    days: summary.days,
    starts: summary.starts.map((start) => ({
      id: String(start._id),
      startedAt: start.startedAt,
      release: start.release ?? null,
      reason: start.reason,
      inWorkingHours: start.inWorkingHours,
    })),
    workingHours,
    sleptInWorkingHours: summary.sleptInWorkingHours,
  };
}
