/**
 * Table bookings. P23 (M14), API-CONTRACT M14 section 3.3.
 *
 * A booking from the page waits for a person, like an online order. A booking
 * typed in from a phone call is confirmed when it is written. Seating either
 * opens an ordinary dine-in order through `openOrder`, so every table rule
 * applies unchanged.
 */
import { guestLabelFor } from '../config/onlineReasons.js';
import { COUNTER_NAMES } from '../models/Counter.js';
import { ORDER_TYPES, ORIGIN_KINDS } from '../models/Order.js';
import {
  Reservation,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
} from '../models/Reservation.js';
import {
  BusinessRuleError,
  NotFoundError,
  OnlineClosedError,
  RequestAlreadyDecidedError,
  ReservationClashError,
  TooManyOpenRequestsError,
  ValidationError,
} from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { businessDateFor, formatTimeIst12, nowUtc } from '../utils/time.js';
import { assertGuestToken, consentRecord, makeStatusToken, namesFor, nextReference, onlineSettings } from './onlineCommon.js';
import { bookableDates, reservationSlots } from './openingHoursService.js';
import { assertTableUsable, openOrder } from './orderOpenService.js';

const MINUTE_MS = 60_000;
const MONGO_DUPLICATE_KEY = 11000;

/** At most this many open bookings per phone per branch. */
export const MAX_OPEN_RESERVATIONS_PER_PHONE = 3;
/** A no-show can be marked this long after the booked time, not before. */
export const NO_SHOW_AFTER_MINUTES = 15;
/** A booking request is answered at least this long before its time. */
const ANSWER_BEFORE_MINUTES = 30;
/** A table shows Reserved for guests running this late. */
const LATE_GRACE_MINUTES = 15;

const { REQUESTED, CONFIRMED, DECLINED, CANCELLED, EXPIRED, SEATED, NO_SHOW } = RESERVATION_STATUSES;

/* ------------------------------------------------------------------------- *
 * Status
 * ------------------------------------------------------------------------- */

export function effectiveStatus(doc, now = nowUtc()) {
  if (doc.status === REQUESTED && doc.answerBy && doc.answerBy <= now) return EXPIRED;
  return doc.status;
}

/** "Waiting for an answer right now": requested and still inside its deadline. */
export function requestedFilter(now) {
  return { status: REQUESTED, $or: [{ answerBy: null }, { answerBy: { $gt: now } }] };
}

/** Requested and not expired, or confirmed: the ones still holding a place. */
function liveFilter(now) {
  return { $or: [{ status: CONFIRMED }, { status: REQUESTED, answerBy: { $gt: now } }] };
}

async function loadOrThrow(req, id) {
  const doc = await Reservation.findOne({ ...scoped(req), _id: id });
  if (!doc) throw new NotFoundError('Booking not found.');
  return doc;
}

/**
 * Moves a booking from one of `from` to a new state in one write, filtered on
 * the state, so two people acting at once cannot both succeed.
 */
async function transition(req, id, now, fromFilter, set) {
  const updated = await Reservation.findOneAndUpdate({ ...scoped(req), _id: id, ...fromFilter }, { $set: set }, { new: true });
  if (updated) return updated;
  const doc = await loadOrThrow(req, id);
  if (effectiveStatus(doc, now) === EXPIRED && doc.status === REQUESTED) {
    await Reservation.updateOne({ ...scoped(req), _id: id, status: REQUESTED }, { $set: { status: EXPIRED } });
  }
  throw new RequestAlreadyDecidedError(effectiveStatus(doc, now));
}

/* ------------------------------------------------------------------------- *
 * Serialising
 * ------------------------------------------------------------------------- */

export function serialiseForGuest(doc, now = nowUtc()) {
  const status = effectiveStatus(doc, now);
  return {
    id: String(doc._id),
    reference: doc.reference,
    status,
    guestName: doc.guestName,
    partySize: doc.partySize,
    at: doc.at,
    answerBy: doc.answerBy,
    declineReason: status === DECLINED ? guestLabelFor(doc.declineReasonCode) : null,
  };
}

export function serialiseForStaff(doc, names, now = nowUtc()) {
  const json = doc.toJSON();
  json.status = effectiveStatus(doc, now);
  json.decidedByName = doc.decidedBy ? (names.get(String(doc.decidedBy)) ?? null) : null;
  json.seatedByName = doc.seatedBy ? (names.get(String(doc.seatedBy)) ?? null) : null;
  return json;
}

async function forStaff(req, doc, now) {
  const names = await namesFor(req, [doc.decidedBy, doc.seatedBy]);
  return serialiseForStaff(doc, names, now);
}

/* ------------------------------------------------------------------------- *
 * Guests
 * ------------------------------------------------------------------------- */

/** The times a guest may book on a date, for the page. */
export async function slots(req, { date, partySize }) {
  const now = nowUtc();
  const { online, dayStartMinutes } = await onlineSettings(req);
  if (!online.reservationsEnabled) throw new OnlineClosedError('This cafe is not taking bookings online.');
  assertPartySize(partySize, online);
  assertBookableDate(date, now, online, dayStartMinutes);
  return { date, slots: reservationSlots(date, now, online) };
}

function assertPartySize(partySize, online) {
  if (partySize > online.reservationMaxPartySize) {
    throw new ValidationError(`For more than ${online.reservationMaxPartySize} people, please call the cafe.`, {
      partySize: `At most ${online.reservationMaxPartySize}.`,
    });
  }
}

function assertBookableDate(date, now, online, dayStartMinutes) {
  const { first, last } = bookableDates(now, online, dayStartMinutes);
  if (date < first || date > last) {
    throw new ValidationError(`Bookings are taken up to ${online.reservationDaysAhead} days ahead.`, {
      date: 'Choose a date from the list.',
    });
  }
}

async function assertUnderOpenLimit(req, phone, now) {
  const open = await Reservation.countDocuments({
    ...scoped(req),
    guestPhone: phone,
    at: { $gt: now },
    ...liveFilter(now),
  });
  if (open >= MAX_OPEN_RESERVATIONS_PER_PHONE) {
    throw new TooManyOpenRequestsError('You already have bookings coming up. Call the cafe to book more.');
  }
}

export async function request(req, body) {
  const now = nowUtc();
  const { online, dayStartMinutes } = await onlineSettings(req);
  if (!online.reservationsEnabled) throw new OnlineClosedError('This cafe is not taking bookings online.');

  const repeat = await Reservation.findOne({ ...scoped(req), idempotencyKey: body.idempotencyKey });
  if (repeat) return { created: false, doc: repeat, token: null };

  assertPartySize(body.partySize, online);
  const date = businessDateFor(body.at, dayStartMinutes);
  assertBookableDate(date, now, online, dayStartMinutes);
  const offered = reservationSlots(date, now, online).map((slot) => slot.getTime());
  if (!offered.includes(body.at.getTime())) {
    throw new ValidationError('Choose one of the times offered.', { at: 'Choose one of the times offered.' });
  }

  await assertUnderOpenLimit(req, body.guestPhone, now);

  const reference = await nextReference(req, COUNTER_NAMES.RESERVATION, 'R');
  const { token, hash } = makeStatusToken();

  const answerBy = new Date(
    Math.min(
      body.at.getTime(),
      Math.max(
        body.at.getTime() - ANSWER_BEFORE_MINUTES * MINUTE_MS,
        now.getTime() + online.takeawayAnswerWithinMinutes * MINUTE_MS,
      ),
    ),
  );

  try {
    const doc = await Reservation.create({
      ...scoped(req),
      reference,
      source: RESERVATION_SOURCES.ONLINE,
      idempotencyKey: body.idempotencyKey,
      guestName: body.guestName,
      guestPhone: body.guestPhone,
      partySize: body.partySize,
      at: body.at,
      businessDate: date,
      note: body.note,
      status: REQUESTED,
      answerBy,
      statusTokenHash: hash,
      marketingConsent: consentRecord(body.marketingConsent, now),
    });
    return { created: true, doc, token };
  } catch (error) {
    if (error?.code === MONGO_DUPLICATE_KEY && Object.hasOwn(error.keyPattern ?? {}, 'idempotencyKey')) {
      const winner = await Reservation.findOne({ ...scoped(req), idempotencyKey: body.idempotencyKey });
      return { created: false, doc: winner, token: null };
    }
    throw error;
  }
}

export async function guestRead(req, id) {
  const doc = await Reservation.findOne({ ...scoped(req), _id: id });
  assertGuestToken(doc, req);
  return serialiseForGuest(doc);
}

export async function guestCancel(req, id) {
  const now = nowUtc();
  const doc = await Reservation.findOne({ ...scoped(req), _id: id });
  assertGuestToken(doc, req);
  const cancelled = await transition(req, id, now, { at: { $gt: now }, ...liveFilter(now) }, {
    status: CANCELLED,
    cancelledAt: now,
    cancelledBy: null,
  });
  return serialiseForGuest(cancelled, now);
}

/* ------------------------------------------------------------------------- *
 * Staff
 * ------------------------------------------------------------------------- */

export async function list(req, { date, status, openOnly }) {
  const now = nowUtc();
  const filter = { ...scoped(req) };
  if (date) filter.businessDate = date;
  if (status === REQUESTED) Object.assign(filter, requestedFilter(now));
  else if (status === EXPIRED) {
    filter.$or = [{ status: EXPIRED }, { status: REQUESTED, answerBy: { $lte: now } }];
  } else if (status) filter.status = status;
  else if (openOnly) Object.assign(filter, liveFilter(now));

  const docs = await Reservation.find(filter).sort({ at: 1 }).limit(500);
  const names = await namesFor(req, docs.flatMap((doc) => [doc.decidedBy, doc.seatedBy]));
  return docs.map((doc) => serialiseForStaff(doc, names, now));
}

export async function readOne(req, id) {
  return forStaff(req, await loadOrThrow(req, id), nowUtc());
}

/**
 * Another confirmed booking on this table, inside the hold window either side.
 * Listed by reference and time, so the person confirming can see which.
 */
async function assertNoClash(req, { tableId, at, excludeId }, online) {
  const hold = online.reservationHoldMinutes * MINUTE_MS;
  const clashes = await Reservation.find({
    ...scoped(req),
    tableId,
    status: CONFIRMED,
    at: { $gt: new Date(at.getTime() - hold), $lt: new Date(at.getTime() + hold) },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('reference at');
  if (clashes.length > 0) {
    throw new ReservationClashError(clashes.map((clash) => ({ reference: clash.reference, at: clash.at })));
  }
}

export async function createPhone(req, body) {
  const now = nowUtc();
  const { online, dayStartMinutes } = await onlineSettings(req);
  if (body.at <= now) throw new ValidationError('Choose a time later than now.', { at: 'Must be later than now.' });

  let table = null;
  if (body.tableId) {
    table = await assertTableUsable(req, body.tableId);
    await assertNoClash(req, { tableId: table._id, at: body.at }, online);
  }

  const reference = await nextReference(req, COUNTER_NAMES.RESERVATION, 'R');
  const doc = await Reservation.create({
    ...scoped(req),
    reference,
    source: RESERVATION_SOURCES.PHONE,
    guestName: body.guestName,
    guestPhone: body.guestPhone,
    partySize: body.partySize,
    at: body.at,
    businessDate: businessDateFor(body.at, dayStartMinutes),
    note: body.note,
    status: CONFIRMED,
    marketingConsent: consentRecord(false, now),
    tableId: table?._id ?? null,
    tableName: table?.name ?? null,
    decidedBy: req.user.id,
    decidedAt: now,
  });
  return forStaff(req, doc, now);
}

/**
 * Confirm a requested booking, or change the time or table of a confirmed
 * one. A table is checked for clashes against every other confirmed booking.
 */
export async function confirm(req, id, body) {
  const now = nowUtc();
  const { online, dayStartMinutes } = await onlineSettings(req);
  const current = await loadOrThrow(req, id);
  const at = body.at ?? current.at;
  if (body.at && body.at <= now) throw new ValidationError('Choose a time later than now.', { at: 'Must be later than now.' });

  const set = { status: CONFIRMED, at, businessDate: businessDateFor(at, dayStartMinutes) };
  if (current.status === REQUESTED) Object.assign(set, { decidedBy: req.user.id, decidedAt: now });

  if (body.tableId) {
    const table = await assertTableUsable(req, body.tableId);
    await assertNoClash(req, { tableId: table._id, at, excludeId: current._id }, online);
    Object.assign(set, { tableId: table._id, tableName: table.name });
  } else if (body.at && current.tableId) {
    await assertNoClash(req, { tableId: current.tableId, at, excludeId: current._id }, online);
  }

  const updated = await transition(req, id, now, liveFilter(now), set);
  return forStaff(req, updated, now);
}

export async function decline(req, id, { reasonCode, note }) {
  const now = nowUtc();
  const updated = await transition(req, id, now, requestedFilter(now), {
    status: DECLINED,
    declineReasonCode: reasonCode,
    declineNote: note,
    decidedBy: req.user.id,
    decidedAt: now,
  });
  return forStaff(req, updated, now);
}

/**
 * Seat the booking: claim it, then open the table's order. If the order
 * cannot be opened (the table is occupied, say), the booking goes back to
 * where it was and the order's own error is returned.
 */
export async function seat(req, id, { tableId, guestCount }) {
  const now = nowUtc();
  const before = await loadOrThrow(req, id);
  const table = await assertTableUsable(req, tableId);

  const claimed = await transition(req, id, now, liveFilter(now), {
    status: SEATED,
    seatedBy: req.user.id,
    seatedAt: now,
    tableId: table._id,
    tableName: table.name,
  });

  let order;
  try {
    order = await openOrder(req, {
      orderType: ORDER_TYPES.DINE_IN,
      tableId: String(table._id),
      guestCount,
      origin: { kind: ORIGIN_KINDS.RESERVATION, id: claimed._id, reference: claimed.reference, pickupAt: null },
    });
  } catch (error) {
    await Reservation.updateOne(
      { ...scoped(req), _id: id, status: SEATED, orderId: null },
      {
        $set: {
          status: before.status,
          seatedBy: null,
          seatedAt: null,
          tableId: before.tableId ?? null,
          tableName: before.tableName ?? null,
        },
      },
    );
    throw error;
  }

  const seated = await Reservation.findOneAndUpdate(
    { ...scoped(req), _id: id },
    { $set: { orderId: order._id } },
    { new: true },
  );
  return { reservation: await forStaff(req, seated, now), order };
}

export async function noShow(req, id) {
  const now = nowUtc();
  const doc = await loadOrThrow(req, id);
  if (now.getTime() < doc.at.getTime() + NO_SHOW_AFTER_MINUTES * MINUTE_MS) {
    throw new BusinessRuleError(
      `A booking can be marked as a no-show from ${formatTimeIst12(new Date(doc.at.getTime() + NO_SHOW_AFTER_MINUTES * MINUTE_MS))}.`,
    );
  }
  const updated = await transition(req, id, now, { status: CONFIRMED }, {
    status: NO_SHOW,
    noShowBy: req.user.id,
    noShowAt: now,
  });
  return forStaff(req, updated, now);
}

export async function cancel(req, id, { note }) {
  const now = nowUtc();
  const updated = await transition(req, id, now, liveFilter(now), {
    status: CANCELLED,
    cancelledBy: req.user.id,
    cancelledAt: now,
    cancelNote: note,
  });
  return forStaff(req, updated, now);
}

/**
 * For the floor: the next confirmed booking on each of these tables, from a
 * little before now until the hold length ahead. One query.
 */
export async function upcomingByTable(req, tableIds, now, online) {
  if (tableIds.length === 0) return new Map();
  const docs = await Reservation.find({
    ...scoped(req),
    tableId: { $in: tableIds },
    status: CONFIRMED,
    at: {
      $gte: new Date(now.getTime() - LATE_GRACE_MINUTES * MINUTE_MS),
      $lte: new Date(now.getTime() + online.reservationHoldMinutes * MINUTE_MS),
    },
  })
    .sort({ at: 1 })
    .select('tableId reference at partySize guestName');

  const byTable = new Map();
  for (const doc of docs) {
    const key = String(doc.tableId);
    if (!byTable.has(key)) {
      byTable.set(key, {
        id: String(doc._id),
        reference: doc.reference,
        at: doc.at,
        partySize: doc.partySize,
        guestName: doc.guestName,
      });
    }
  }
  return byTable;
}
