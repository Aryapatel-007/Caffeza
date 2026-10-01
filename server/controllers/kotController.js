/**
 * The kitchen display. Shapes come from Part 4 section M2.4.
 *
 * A KOT is created by firing an order and never directly, so there is no POST
 * in this file. The kitchen reads tickets and marks food ready; everything else
 * about a ticket is decided on the floor.
 */
import { Kot } from '../models/Kot.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { loadKotInTenant, markKotLinesReady, serialiseKot } from '../services/kitchenService.js';
import { renderKotTicket } from '../services/kotTicketService.js';
import { sendList, sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';

/**
 * GET /kots
 *
 * Sorted oldest first, which is the opposite of every other list in this
 * product and is correct here: a kitchen works the oldest ticket first.
 *
 * The status filter is applied in memory, because a ticket's status is derived
 * from its lines and the database has no field to filter on. That costs a page
 * that can come back shorter than its limit, and the alternatives are worse: an
 * aggregation that recomputes the rule in a second language, or a stored status
 * that can drift from the lines it describes.
 */
export async function listKots(req, res) {
  const { page, limit, status, stationId } = req.query;

  const filter = { ...scoped(req) };
  // P05. One station's tickets, or "none" for the ones with no station.
  if (stationId !== undefined) filter.stationId = stationId === 'none' ? null : stationId;

  const [tickets, total] = await Promise.all([
    Kot.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Kot.countDocuments(filter),
  ]);

  const serialised = tickets.map(serialiseKot);
  const data = status === undefined ? serialised : serialised.filter((kot) => status.includes(kot.status));

  return sendList(res, data, { page, limit, total });
}

/** GET /kots/:kotId */
export async function getKot(req, res) {
  const kot = await loadKotInTenant(req, req.params.kotId);
  return sendSuccess(res, serialiseKot(kot));
}

/**
 * PATCH /kots/:kotId/lines/:lineId/ready
 *
 * All six roles. Whoever is standing at the pass marks the food ready, and
 * asking them what their job title is while a dish goes cold helps nobody.
 */
export async function markKotLineReady(req, res) {
  const kot = await markKotLinesReady(req, {
    kotId: req.params.kotId,
    lineId: req.params.lineId,
  });

  return sendSuccess(res, kot);
}

/** PATCH /kots/:kotId/ready */
export async function markKotReady(req, res) {
  const kot = await markKotLinesReady(req, { kotId: req.params.kotId });
  return sendSuccess(res, kot);
}

/**
 * GET /kots/:kotId/ticket. P05.
 *
 * The ticket as plain text, laid out on the server like the receipt. The
 * guest count, the customer and the name of whoever fired it are read here,
 * for printing only; none of them is a figure anything adds up.
 */
export async function getKotTicket(req, res) {
  const kot = await loadKotInTenant(req, req.params.kotId);
  const [order, firedBy] = await Promise.all([
    Order.findOne({ ...scoped(req), _id: kot.orderId })
      .select('guestCount customerName platform')
      .lean(),
    User.findOne({ restaurantId: req.restaurantId, _id: kot.firedBy }).select('name').lean(),
  ]);

  const { width, reprint } = req.query;
  const text = renderKotTicket({
    kot,
    order,
    firedByName: firedBy?.name ?? null,
    width,
    reprint: Boolean(reprint),
  });

  return sendSuccess(res, { width, text });
}
