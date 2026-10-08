/**
 * Staff endpoints for online takeaway and bookings. P23 (M14),
 * API-CONTRACT M14 section 3. Every rule lives in the two services; this file
 * only reads the request and sends the answer.
 */
import { Branch } from '../models/Branch.js';
import { OnlineOrder } from '../models/OnlineOrder.js';
import { PlatformOrder } from '../models/PlatformOrder.js';
import { isFeatureOn } from '../services/settingsService.js';
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
  const now = nowUtc();
  const scope = { restaurantId: req.restaurantId, branchId: req.branchId };
  // P25 Part H. Online orders may be off while a delivery platform is connected.
  const onlineOn = await isFeatureOn(req, 'online');
  if (onlineOn) {
    // P24. No scheduler: the tills' poll expires and refunds what nobody answered,
    // and reads back links whose guests may have paid without coming back.
    const { online } = await onlineSettings(req);
    await sweep(req, { online });
  }

  const waitingOrders = { ...scope, ...onlineOrders.waitingFilter(now) };
  const waitingBookings = { ...scope, ...reservations.requestedFilter(now) };
  const waitingPlatform = { ...scope, status: { $in: ['RECEIVED', 'NEEDS_ATTENTION'] } };
  const none = () => Promise.resolve(null);
  const zero = () => Promise.resolve(0);

  const [orderCount, bookingCount, platformCount, oldestOrder, oldestBooking, oldestPlatform, latestOrder, latestBooking, latestPlatform, branch] = await Promise.all([
    onlineOn ? OnlineOrder.countDocuments(waitingOrders) : zero(),
    onlineOn ? Reservation.countDocuments(waitingBookings) : zero(),
    PlatformOrder.countDocuments(waitingPlatform),
    onlineOn ? OnlineOrder.findOne(waitingOrders).sort({ createdAt: 1 }).select('createdAt answerBy') : none(),
    onlineOn ? Reservation.findOne(waitingBookings).sort({ createdAt: 1 }).select('createdAt answerBy') : none(),
    PlatformOrder.findOne(waitingPlatform).sort({ receivedAt: 1 }).select('receivedAt acceptBy'),
    onlineOn ? OnlineOrder.findOne(waitingOrders).sort({ createdAt: -1 }).select('createdAt reference lines pickupAt') : none(),
    onlineOn ? Reservation.findOne(waitingBookings).sort({ createdAt: -1 }).select('createdAt reference partySize at') : none(),
    PlatformOrder.findOne(waitingPlatform).sort({ receivedAt: -1 }).select('receivedAt provider platformCode platformOrderId order.items acceptBy'),
    loadBranch(req),
  ]);

  const candidates = [
    oldestOrder && { at: oldestOrder.createdAt, answerBy: oldestOrder.answerBy },
    oldestBooking && { at: oldestBooking.createdAt, answerBy: oldestBooking.answerBy },
    oldestPlatform && { at: oldestPlatform.receivedAt, answerBy: oldestPlatform.acceptBy },
  ].filter(Boolean);
  const oldest = candidates.sort((a, b) => a.at - b.at)[0] ?? null;
  const latestIsOrder = latestOrder && (!latestBooking || latestOrder.createdAt >= latestBooking.createdAt);
  const latestOnline = latestIsOrder ? latestOrder : latestBooking;
  const latestIsPlatform = latestPlatform && (!latestOnline || latestPlatform.receivedAt >= latestOnline.createdAt);
  const latestDoc = latestOnline;

  return sendSuccess(res, {
    waitingOrders: orderCount,
    waitingReservations: bookingCount,
    waitingPlatformOrders: platformCount,
    oldestWaitingAt: oldest?.at ?? null,
    oldestAnswerBy: oldest?.answerBy ?? null,
    latestRequestAt: latestIsPlatform ? latestPlatform.receivedAt : latestDoc?.createdAt ?? null,
    latest: latestIsPlatform
      ? {
          kind: 'PLATFORM_ORDER',
          provider: latestPlatform.provider,
          reference: `${latestPlatform.platformCode === 'SWIGGY' ? 'Swiggy' : 'Zomato'} ${latestPlatform.platformOrderId}`,
          itemCount: (latestPlatform.order?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
          pickupAt: null,
          partySize: null,
          at: null,
          acceptBy: latestPlatform.acceptBy ?? null,
        }
      : latestDoc
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
    refundFailures: onlineOn ? await refundFailureCount(req) : 0,
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
