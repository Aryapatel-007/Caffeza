/**
 * The assistant's tools. P39 section 9.
 *
 * The model chooses a tool and its arguments; this file decides what happens.
 * Every tool runs for this conversation's own guest, taken from the server and
 * never from the model's arguments, checks its arguments with Zod, and returns
 * plain facts read from our database. There is no tool that gives consent,
 * changes a price, takes card details, or reads another guest's data.
 */
import { z } from 'zod';

import { config } from '../../config/env.js';
import { Category } from '../../models/Category.js';
import { Conversation, CONVERSATION_STATUSES } from '../../models/Conversation.js';
import { MenuItem } from '../../models/MenuItem.js';
import { OnlineOrder } from '../../models/OnlineOrder.js';
import { Reservation, RESERVATION_SOURCES, RESERVATION_STATUSES } from '../../models/Reservation.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { paiseToRupees } from '../../utils/money.js';
import { businessDateFor, formatTimeIst12 } from '../../utils/time.js';
import { stopAllMessages, withdrawOffersFromMessage } from '../customerService.js';
import { windowContaining } from '../openingHoursService.js';
import { cancelByGuest, guestView, request as requestBooking, slots as bookingSlots } from '../reservationService.js';

export const STOP_OFFERS_REASON = 'Asked on WhatsApp to stop offers';
export const STOP_ALL_REASON = 'Asked on WhatsApp to stop all messages';
const MENU_LIMIT = 12;
const rupees = (paise) => paiseToRupees(paise, { symbol: true });

/** "Saturday 12 October" for a business date. */
export function dateWords(businessDate) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${businessDate}T12:00:00Z`));
}

/** "20:00", the instant's wall-clock time in India. */
export function hhmmIst(instant) {
  const ist = new Date(instant.getTime() + 330 * 60_000);
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
}

const timeWords = (instant) => formatTimeIst12(instant).toLowerCase();

/** The booking context the public page runs in: the same rules, for the same branch. */
const bookingReq = (ctx) => ({ restaurantId: String(ctx.restaurantId), branchId: String(ctx.branchId), publicSite: ctx.publicSite });

function addressOf(restaurant) {
  const address = restaurant.address ?? {};
  return [address.line1, address.line2, [address.city, address.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
}

/** The online page link, when the restaurant has one switched on. */
export function pageLinkOf(site) {
  const slug = site.branch?.online?.publicSlug;
  return site.settings?.features?.online && slug ? `${config.CLIENT_ORIGIN}/r/${slug}` : null;
}

/** Whether the restaurant is open now, and today's hours, in words. */
export function openNow(site, now) {
  const { online, business } = site.settings;
  const window = windowContaining(now, online, business.businessDayStartsAtMinutes);
  const hours = `${minutesWords(online.opensAtMinutes)} to ${minutesWords(online.closesAtMinutes)}`;
  return { open: Boolean(window), hours, sentence: window ? `open now, until ${timeWords(window.closesAt)}` : `closed now; it opens ${hours}` };
}

function minutesWords(minutes) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}

const SCHEMAS = {
  get_restaurant_info: z.object({}).strict(),
  search_menu: z.object({ query: z.string().trim().max(80).optional() }).strict(),
  get_booking_options: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), partySize: z.coerce.number().int().min(1).max(50) }).strict(),
  request_booking: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/),
      partySize: z.coerce.number().int().min(1).max(50),
      name: z.string().trim().min(1).max(60),
      note: z.string().trim().max(200).optional(),
    })
    .strict(),
  my_bookings: z.object({}).strict(),
  cancel_booking: z.object({ reference: z.string().trim().min(2).max(20) }).strict(),
  my_takeaway: z.object({}).strict(),
  stop_messages: z.object({ scope: z.enum(['OFFERS', 'ALL']) }).strict(),
  hand_to_staff: z.object({ reason: z.string().trim().min(1).max(300) }).strict(),
};

/** What the model is told about each tool. Simple schemas: both providers accept them. */
export const TOOL_DEFINITIONS = Object.freeze([
  { name: 'get_restaurant_info', description: "The restaurant's name, address, phone, today's hours, whether it is open now, and its online page link.", parameters: { type: 'object', properties: {} } },
  {
    name: 'search_menu',
    description: 'Dishes on the menu, with their sizes and prices before GST and whether they are available today. Give words to search for, or none for the sections of the menu.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for, like "paneer" or "drinks".' } } },
  },
  {
    name: 'get_booking_options',
    description: 'The table booking times offered for a date and number of people, or why there are none.',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, partySize: { type: 'integer', description: 'How many people' } },
      required: ['date', 'partySize'],
    },
  },
  {
    name: 'request_booking',
    description: 'Books a table after the guest has confirmed the details. The restaurant then confirms it.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM on a 24-hour clock, one of the times get_booking_options returned' },
        partySize: { type: 'integer' },
        name: { type: 'string', description: 'The name for the booking' },
        note: { type: 'string', description: 'Anything to tell the restaurant, such as an allergy or a high chair' },
      },
      required: ['date', 'time', 'partySize', 'name'],
    },
  },
  { name: 'my_bookings', description: "This guest's upcoming table bookings.", parameters: { type: 'object', properties: {} } },
  {
    name: 'cancel_booking',
    description: "Cancels one of this guest's bookings by its reference, after the guest has confirmed which.",
    parameters: { type: 'object', properties: { reference: { type: 'string', description: 'Like R-17' } }, required: ['reference'] },
  },
  { name: 'my_takeaway', description: "This guest's latest online takeaway order and its state.", parameters: { type: 'object', properties: {} } },
  {
    name: 'stop_messages',
    description: 'Stops messages to this guest. OFFERS: no more promotions; bills and booking messages still come. ALL: nothing more at all.',
    parameters: { type: 'object', properties: { scope: { type: 'string', enum: ['OFFERS', 'ALL'] } }, required: ['scope'] },
  },
  {
    name: 'hand_to_staff',
    description: 'Hands this chat to a person at the restaurant.',
    parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Why, in a few words' } }, required: ['reason'] },
  },
]);

const RUNNERS = {
  get_restaurant_info(ctx) {
    const { restaurant } = ctx.publicSite;
    const now = openNow(ctx.publicSite, ctx.now);
    return {
      name: restaurant.name,
      address: addressOf(restaurant),
      phone: restaurant.contactPhone || null,
      todaysHours: now.hours,
      openNow: now.open,
      openSentence: now.sentence,
      onlinePage: pageLinkOf(ctx.publicSite),
    };
  },

  async search_menu(ctx, { query }) {
    const scope = { restaurantId: ctx.restaurantId, branchId: ctx.branchId };
    const categories = await Category.find({ ...scope, isActive: true }).sort({ displayOrder: 1, name: 1 }).select('name').lean();
    const categoryName = new Map(categories.map((category) => [String(category._id), category.name]));
    const words = (query ?? '').split(/\s+/).filter((word) => word.length >= 2).slice(0, 4);
    if (words.length === 0) return { sections: categories.map((category) => category.name), pricesNote: 'Menu prices are before GST.' };

    const matching = categories.filter((category) => words.some((word) => new RegExp(escapeRegex(word), 'i').test(category.name))).map((category) => category._id);
    const filter = {
      ...scope,
      isActive: true,
      categoryId: { $in: categories.map((category) => category._id) },
      $or: [...words.map((word) => ({ name: new RegExp(escapeRegex(word), 'i') })), ...(matching.length ? [{ categoryId: { $in: matching } }] : [])],
    };
    const items = await MenuItem.find(filter).sort({ displayOrder: 1, name: 1 }).limit(MENU_LIMIT).lean();
    return {
      dishes: items.map((item) => ({
        name: item.name,
        section: categoryName.get(String(item.categoryId)) ?? null,
        available: item.isAvailable !== false,
        ...(item.variants?.length
          ? { sizes: item.variants.map((variant) => ({ size: variant.name, price: rupees(variant.priceInPaise), available: variant.isAvailable !== false })) }
          : { price: rupees(item.priceInPaise) }),
      })),
      more: items.length === MENU_LIMIT,
      pricesNote: 'Menu prices are before GST.',
    };
  },

  async get_booking_options(ctx, { date, partySize }) {
    if (!ctx.settings.assistant.bookingsEnabled) return { ok: false, error: 'Bookings are not taken on WhatsApp. Offer to hand the chat to a person.' };
    try {
      const { slots } = await bookingSlots(bookingReq(ctx), { date, partySize });
      return { date, dateWords: dateWords(date), partySize, times: slots.map((at) => ({ time: hhmmIst(at), words: timeWords(at) })) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  },

  async request_booking(ctx, { date, time, partySize, name, note }) {
    if (!ctx.settings.assistant.bookingsEnabled) return { ok: false, error: 'Bookings are not taken on WhatsApp.' };
    const req = bookingReq(ctx);
    let offered;
    try {
      offered = (await bookingSlots(req, { date, partySize })).slots;
    } catch (error) {
      return { ok: false, error: error.message };
    }
    const at = offered.find((slot) => hhmmIst(slot) === time);
    if (!at) return { ok: false, error: 'That time is not offered.', offeredTimes: offered.map((slot) => hhmmIst(slot)) };
    try {
      const { doc } = await requestBooking(
        req,
        {
          idempotencyKey: `wa:${ctx.conversation._id}:${date}:${time}:${partySize}`,
          guestName: name,
          guestPhone: ctx.customer.phone,
          partySize,
          at,
          note: note ?? null,
          marketingConsent: false,
        },
        { source: RESERVATION_SOURCES.WHATSAPP },
      );
      const view = await guestView(req, doc._id, ctx.now);
      return {
        ok: true,
        reference: view.reference,
        status: view.status,
        waitsForTheRestaurant: true,
        dateWords: dateWords(date),
        time: timeWords(at),
        partySize: view.partySize,
        ...(view.payment?.payUrl ? { deposit: rupees(view.payment.amountInPaise), depositLink: view.payment.payUrl } : {}),
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  },

  async my_bookings(ctx) {
    const rows = await Reservation.find({
      restaurantId: ctx.restaurantId,
      branchId: ctx.branchId,
      guestPhone: ctx.customer.phone,
      at: { $gt: ctx.now },
      status: { $in: [RESERVATION_STATUSES.REQUESTED, RESERVATION_STATUSES.CONFIRMED, RESERVATION_STATUSES.AWAITING_PAYMENT] },
    })
      .sort({ at: 1 })
      .limit(5)
      .lean();
    return {
      bookings: rows.map((row) => ({
        reference: row.reference,
        state: row.status === RESERVATION_STATUSES.CONFIRMED ? 'confirmed' : row.status === RESERVATION_STATUSES.AWAITING_PAYMENT ? 'waiting for the deposit' : 'waiting for the restaurant to confirm',
        dateWords: dateWords(businessDateFor(row.at, ctx.settings.business.businessDayStartsAtMinutes)),
        time: timeWords(row.at),
        partySize: row.partySize,
      })),
    };
  },

  async cancel_booking(ctx, { reference }) {
    const row = await Reservation.findOne({ restaurantId: ctx.restaurantId, branchId: ctx.branchId, reference: reference.toUpperCase(), guestPhone: ctx.customer.phone }).lean();
    if (!row) return { ok: false, error: 'No booking of this guest has that reference.' };
    try {
      const view = await cancelByGuest(bookingReq(ctx), row._id);
      const refunded = view.payment && view.payment.refundedInPaise > 0;
      return { ok: true, reference: view.reference, cancelled: true, deposit: view.payment ? (refunded ? 'The deposit is refunded.' : 'The deposit is kept, as the booking page said.') : null };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  },

  async my_takeaway(ctx) {
    const order = await OnlineOrder.findOne({ restaurantId: ctx.restaurantId, branchId: ctx.branchId, customerPhone: ctx.customer.phone }).sort({ createdAt: -1 }).lean();
    if (!order) return { takeaway: null };
    return { takeaway: { reference: order.reference, state: String(order.status).toLowerCase().replaceAll('_', ' '), pickup: order.pickupAt ? timeWords(order.pickupAt) : null } };
  },

  async stop_messages(ctx, { scope }) {
    if (scope === 'ALL') await stopAllMessages(ctx, ctx.customer._id, STOP_ALL_REASON);
    else await withdrawOffersFromMessage(ctx, ctx.customer._id, STOP_OFFERS_REASON);
    ctx.stoppedScope = scope;
    return { ok: true, scope, stillSent: scope === 'OFFERS' ? 'Bills and booking messages still come.' : 'Nothing more will be sent.' };
  },

  async hand_to_staff(ctx, { reason }) {
    await Conversation.updateOne(
      { restaurantId: ctx.restaurantId, _id: ctx.conversation._id },
      { $set: { status: CONVERSATION_STATUSES.NEEDS_STAFF, handoffReason: reason } },
    );
    ctx.handedOver = true;
    return { ok: true };
  },
};

/**
 * Runs one tool the model asked for. Never throws: a refusal or a bad argument
 * comes back as `{ ok: false, error }` for the model to read. Records each run
 * on `ctx.ran`, which the reply check reads.
 */
export async function runTool(name, args, ctx) {
  const schema = SCHEMAS[name];
  if (!schema) return { ok: false, error: `No tool called ${name}.` };
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: 'Those details are not right.', problems: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  let result;
  try {
    result = await RUNNERS[name](ctx, parsed.data);
  } catch {
    result = { ok: false, error: 'That could not be done just now.' };
  }
  ctx.ran.push({ name, ok: result?.ok !== false, result });
  return result;
}

export default { runTool, TOOL_DEFINITIONS };
