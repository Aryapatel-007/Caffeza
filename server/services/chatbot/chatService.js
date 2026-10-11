/**
 * The staff's side of WhatsApp chats. P39 section 14, API-CONTRACT "P39" 6.
 *
 * Chats name a guest by first name only; no phone number leaves the server.
 * A staff reply is a free-form message, so it goes only inside the 24-hour
 * window the guest's last message opened.
 */
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { Conversation, CONVERSATION_STATUSES, TURN_ROLES } from '../../models/Conversation.js';
import { Customer } from '../../models/Customer.js';
import { Reservation, RESERVATION_STATUSES } from '../../models/Reservation.js';
import { BusinessRuleError, MessagingNotConnectedError, NotFoundError } from '../../utils/errors.js';
import { scoped } from '../../utils/scopedQuery.js';
import { formatTimeIst12, nowUtc } from '../../utils/time.js';
import { clearStopAll } from '../customerService.js';
import { enqueueJob } from '../integrations/jobRunner.js';
import { SEND_WHATSAPP_TEXT, SERVICE_WINDOW_MS } from '../integrations/messaging/whatsappService.js';
import { recordReply } from './chatTurns.js';

const STATUS_ORDER = { NEEDS_STAFF: 0, STAFF: 1, BOT: 2, CLOSED: 3 };
const firstName = (customer) => (customer?.name ? customer.name.split(/\s+/)[0] : null);
const windowOpen = (conversation, now) => Boolean(conversation.lastInboundAt) && now.getTime() - new Date(conversation.lastInboundAt).getTime() < SERVICE_WINDOW_MS;
const visibleTurns = (turns) => turns.filter((turn) => turn.role !== TURN_ROLES.TOOL);

function present(conversation, customer, now) {
  const last = visibleTurns(conversation.turns).at(-1);
  return {
    id: String(conversation._id),
    status: conversation.status,
    guestFirstName: firstName(customer),
    lastMessageAt: conversation.lastMessageAt,
    lastText: last ? String(last.text).slice(0, 120) : null,
    windowOpen: windowOpen(conversation, now),
    handoffReason: conversation.handoffReason,
    stoppedAll: Boolean(customer?.whatsappStoppedAt),
  };
}

/** GET /chats. Those needing a person first, then by last message. */
export async function listChats(req) {
  const rows = await Conversation.find({ ...scoped(req) }).sort({ lastMessageAt: -1 }).limit(100).lean();
  const customers = await Customer.find({ restaurantId: req.restaurantId, _id: { $in: rows.map((row) => row.customerId) } }).select('name whatsappStoppedAt').lean();
  const byId = new Map(customers.map((customer) => [String(customer._id), customer]));
  const now = nowUtc();
  return rows
    .map((row) => present(row, byId.get(String(row.customerId)), now))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
}

async function loadChat(req, chatId) {
  const conversation = await Conversation.findOne({ ...scoped(req), _id: chatId });
  if (!conversation) throw new NotFoundError('Chat not found.');
  return conversation;
}

/** GET /chats/:chatId. The turns a person reads, and the guest's coming bookings. */
export async function readChat(req, chatId) {
  const conversation = await loadChat(req, chatId);
  const customer = await Customer.findOne({ restaurantId: req.restaurantId, _id: conversation.customerId }).lean();
  const now = nowUtc();
  const bookings = customer
    ? await Reservation.find({ ...scoped(req), guestPhone: customer.phone, at: { $gt: now }, status: { $in: [RESERVATION_STATUSES.REQUESTED, RESERVATION_STATUSES.CONFIRMED, RESERVATION_STATUSES.AWAITING_PAYMENT] } })
        .sort({ at: 1 })
        .limit(5)
        .lean()
    : [];
  return {
    ...present(conversation, customer, now),
    turns: visibleTurns(conversation.turns).map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
    bookings: bookings.map((booking) => ({ id: String(booking._id), reference: booking.reference, status: booking.status, at: booking.at, time: formatTimeIst12(booking.at), partySize: booking.partySize })),
  };
}

/** POST /chats/:chatId/reply. Inside the window only; the chat is then with staff. */
export async function replyToChat(req, chatId, { text }) {
  const conversation = await loadChat(req, chatId);
  const now = nowUtc();
  if (!windowOpen(conversation, now)) {
    throw new BusinessRuleError("This guest's 24-hour window has closed. WhatsApp lets you reply only within 24 hours of their last message; call them instead.");
  }
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider: 'WHATSAPP' }).lean();
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) throw new MessagingNotConnectedError();
  await enqueueJob(req, {
    connectionId: connection._id,
    type: SEND_WHATSAPP_TEXT,
    payload: { customerId: String(conversation.customerId), text, replyToInboundAt: new Date(conversation.lastInboundAt).toISOString() },
  });
  await recordReply(req, conversation._id, text, TURN_ROLES.STAFF);
  await Conversation.updateOne({ ...scoped(req), _id: conversation._id }, { $set: { status: CONVERSATION_STATUSES.STAFF } });
  return readChat(req, chatId);
}

async function setStatus(req, chatId, status) {
  const conversation = await loadChat(req, chatId);
  await Conversation.updateOne({ ...scoped(req), _id: conversation._id }, { $set: { status, ...(status === CONVERSATION_STATUSES.BOT ? { handoffReason: null } : {}) } });
  return readChat(req, chatId);
}

/** POST /chats/:chatId/hand-back. */
export const handBack = (req, chatId) => setStatus(req, chatId, CONVERSATION_STATUSES.BOT);
/** POST /chats/:chatId/done. */
export const closeChat = (req, chatId) => setStatus(req, chatId, CONVERSATION_STATUSES.CLOSED);

/** POST /chats/:chatId/clear-stop. The guest asked for messages again; staff say so. */
export async function clearStop(req, chatId, { reason }) {
  const conversation = await loadChat(req, chatId);
  if (!reason) throw new BusinessRuleError('Say why the guest wants messages again.');
  await clearStopAll(req, conversation.customerId);
  return readChat(req, chatId);
}

/** For the online inbox's alert: chats waiting for a person, and the newest of them. */
export async function waitingChats(req) {
  const rows = await Conversation.find({ ...scoped(req), status: CONVERSATION_STATUSES.NEEDS_STAFF }).sort({ lastMessageAt: -1 }).select('lastMessageAt').limit(50).lean();
  return { waitingChats: rows.length, latestChatAt: rows[0]?.lastMessageAt ?? null };
}

export default { clearStop, closeChat, handBack, listChats, readChat, replyToChat, waitingChats };
