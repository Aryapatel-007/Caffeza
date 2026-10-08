/**
 * Staff endpoints for online takeaway and bookings. P23 (M14),
 * API-CONTRACT M14 section 3. Every rule lives in the two services; this file
 * only reads the request and sends the answer.
 */
import { Branch } from '../models/Branch.js';
import { OnlineOrder } from '../models/OnlineOrder.js';
import { Reservation } from '../models/Reservation.js';
import { activePause, onlineSettings } from '../services/onlineCommon.js';
import { refundFailureCount, sweep } from '../services/onlinePaymentService.js';
import * as onlineOrders from '../services/onlineOrderService.js';
import { windowContaining } from '../services/openingHoursService.js';
import * as reservations from '../services/reservationService.js';
import { BusinessRuleError, DuplicateError, NotFoundError } from '../utils/errors.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { nowUtc } from '../utils/time.js';

const MINUTE_MS = 60_000;
const MONGO_DUPLICATE_KEY = 11000;

async function loadBranch(req) {
  const branch = await Branch.findOne({ _id: req.branchId, restaurantId: req.restaurantId });
  if (!branch) throw new NotFoundError('Branch not found.');
  return branch;
}

/**
 * GET /online/inbox. The poll behind the alert: two counts and two finds on
 * indexed fields, cheap enough for every till to ask every 15 seconds.
 */
export async function getInbox(req, res) {
  // P24. No scheduler: the tills' poll expires and refunds what nobody answered,
  // and reads back links whose guests may have paid without coming back.
  const { online } = await onlineSettings(req);
  await sweep(req, { online });

  const now = nowUtc();
  const scope = { restaurantId: req.restaurantId, branchId: req.branchId };
  const waitingOrders = { ...scope, ...onlineOrders.waitingFilter(now) };
  const waitingBookings = { ...scope, ...reservations.requestedFilter(now) };

  const [orderCount, bookingCount, oldestOrder, oldestBooking, latestOrder, latestBooking, branch] = await Promise.all([
    OnlineOrder.countDocuments(waitingOrders),
    Reservation.countDocuments(waitingBookings),
    OnlineOrder.findOne(waitingOrders).sort({ createdAt: 1 }).select('createdAt answerBy'),
    Reservation.findOne(waitingBookings).sort({ createdAt: 1 }).select('createdAt answerBy'),
    OnlineOrder.findOne(waitingOrders).sort({ createdAt: -1 }).select('createdAt reference lines pickupAt'),
    Reservation.findOne(waitingBookings).sort({ createdAt: -1 }).select('createdAt reference partySize at'),
    loadBranch(req),
  ]);

  const oldest = [oldestOrder, oldestBooking].filter(Boolean).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  const latestIsOrder = latestOrder && (!latestBooking || latestOrder.createdAt >= latestBooking.createdAt);
  const latestDoc = latestIsOrder ? latestOrder : latestBooking;

  return sendSuccess(res, {
    waitingOrders: orderCount,
    waitingReservations: bookingCount,
    oldestWaitingAt: oldest?.createdAt ?? null,
    oldestAnswerBy: oldest?.answerBy ?? null,
    latestRequestAt: latestDoc?.createdAt ?? null,
    latest: latestDoc
      ? latestIsOrder
        ? {
            kind: 'ONLINE_ORDER',
            reference: latestDoc.reference,
            itemCount: latestDoc.lines.reduce((sum, line) => sum + line.quantity, 0),
            pickupAt: latestDoc.pickupAt,
            partySize: null,
            at: null,
          }
        : {
            kind: 'RESERVATION',
            reference: latestDoc.reference,
            itemCount: null,
            pickupAt: null,
            partySize: latestDoc.partySize,
            at: latestDoc.at,
          }
      : null,
    pausedUntil: activePause(branch, now),
    refundFailures: await refundFailureCount(req),
  });
}

/* Online orders ----------------------------------------------------------- */

export async function listOnlineOrders(req, res) {
  const { page, limit } = req.query;
  const { data, total } = await onlineOrders.list(req, req.query);
  return sendList(res, data, { page, limit, total });
}

export async function getOnlineOrder(req, res) {
  return sendSuccess(res, await onlineOrders.readOne(req, req.params.id));
}

export async function acceptOnlineOrder(req, res) {
  return sendSuccess(res, await onlineOrders.accept(req, req.params.id, req.body));
}

export async function declineOnlineOrder(req, res) {
  return sendSuccess(res, await onlineOrders.decline(req, req.params.id, req.body));
}

/* Bookings ---------------------------------------------------------------- */

export async function listReservations(req, res) {
  return sendSuccess(res, await reservations.list(req, req.query));
}

export async function getReservation(req, res) {
  return sendSuccess(res, await reservations.readOne(req, req.params.id));
}

export async function createReservation(req, res) {
  return sendSuccess(res, await reservations.createPhone(req, req.body), 201);
}

export async function confirmReservation(req, res) {
  return sendSuccess(res, await reservations.confirm(req, req.params.id, req.body));
}

export async function declineReservation(req, res) {
  return sendSuccess(res, await reservations.decline(req, req.params.id, req.body));
}

export async function seatReservation(req, res) {
  return sendSuccess(res, await reservations.seat(req, req.params.id, req.body));
}

export async function noShowReservation(req, res) {
  return sendSuccess(res, await reservations.noShow(req, req.params.id));
}

export async function cancelReservation(req, res) {
  return sendSuccess(res, await reservations.cancel(req, req.params.id, req.body));
}

/* Pause and the page address ---------------------------------------------- */

/** POST /online/pause. Takeaway only: a rush stops new takeaway, not Saturday's bookings. */
export async function pause(req, res) {
  const now = nowUtc();
  let until;
  if (req.body.untilClose) {
    const { online, dayStartMinutes } = await onlineSettings(req);
    const window = windowContaining(now, online, dayStartMinutes);
    if (!window) throw new BusinessRuleError('Takeaway is already closed for today.');
    until = window.closesAt;
  } else {
    until = new Date(now.getTime() + req.body.minutes * MINUTE_MS);
  }

  await Branch.updateOne(
    { _id: req.branchId, restaurantId: req.restaurantId },
    { $set: { 'online.pausedUntil': until, 'online.pausedBy': req.user.id } },
  );
  req.log?.info({ actorId: req.user.id, pausedUntil: until }, 'Online takeaway paused.');
  return sendSuccess(res, { pausedUntil: until });
}

export async function resume(req, res) {
  await Branch.updateOne(
    { _id: req.branchId, restaurantId: req.restaurantId },
    { $set: { 'online.pausedUntil': null, 'online.pausedBy': req.user.id } },
  );
  return sendSuccess(res, { pausedUntil: null });
}

/** PATCH /online/site. The page address. Unique across every restaurant, by index. */
export async function updateSite(req, res) {
  try {
    await Branch.updateOne(
      { _id: req.branchId, restaurantId: req.restaurantId },
      { $set: { 'online.publicSlug': req.body.publicSlug } },
    );
  } catch (error) {
    if (error?.code === MONGO_DUPLICATE_KEY) {
      throw new DuplicateError('That page address is taken. Choose another.', { publicSlug: 'Already taken.' });
    }
    throw error;
  }
  return sendSuccess(res, { publicSlug: req.body.publicSlug });
}
