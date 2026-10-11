/**
 * Telling a WhatsApp booking's guest what the restaurant decided. P39 section 13.
 *
 * Inside the guest's 24-hour window, a plain message; after it, the utility
 * template BOOKING_CONFIRMED or BOOKING_DECLINED, when the owner has one
 * approved. Called by reservationService after the staff's action is saved; it
 * never throws there.
 */
import { CONNECTION_STATUSES, IntegrationConnection } from '../../models/IntegrationConnection.js';
import { Conversation } from '../../models/Conversation.js';
import { Customer } from '../../models/Customer.js';
import { TEMPLATE_KEYS } from '../../models/MessageTemplate.js';
import { RESERVATION_STATUSES } from '../../models/Reservation.js';
import { businessDateFor, formatTimeIst12, nowUtc } from '../../utils/time.js';
import { getSettings } from '../settingsService.js';
import { enqueueJob } from '../integrations/jobRunner.js';
import { SEND_WHATSAPP_TEXT, SERVICE_WINDOW_MS, sendTemplate } from '../integrations/messaging/whatsappService.js';
import { guestLabelFor } from '../../config/onlineReasons.js';
import { recordReply } from './chatTurns.js';
import { dateWords } from './tools.js';

export async function tellGuestAboutBooking(req, doc) {
  const confirmed = doc.status === RESERVATION_STATUSES.CONFIRMED;
  const declined = doc.status === RESERVATION_STATUSES.DECLINED;
  if (!confirmed && !declined) return null;

  const ctx = { restaurantId: doc.restaurantId, branchId: doc.branchId };
  const connection = await IntegrationConnection.findOne({ ...ctx, provider: 'WHATSAPP' }).lean();
  if (!connection || connection.status !== CONNECTION_STATUSES.ACTIVE) return null;
  const customer = await Customer.findOne({ restaurantId: ctx.restaurantId, phone: doc.guestPhone }).lean();
  if (!customer) return null;

  const settings = await getSettings(ctx.restaurantId, { req });
  const date = dateWords(businessDateFor(doc.at, settings.business.businessDayStartsAtMinutes));
  const time = formatTimeIst12(doc.at).toLowerCase();
  const reason = declined ? guestLabelFor(doc.declineReasonCode) ?? 'we cannot take it' : null;
  const text = confirmed
    ? `Your table is confirmed: *${doc.reference}*, ${date} at *${time}*, for ${doc.partySize}. See you then.`
    : `Sorry, we cannot take booking *${doc.reference}*: ${reason}.`;
  const key = `booking:${doc._id}:${doc.status}:${doc.at.getTime()}`;

  const conversation = await Conversation.findOne({ ...ctx, customerId: customer._id }).lean();
  const windowOpen = conversation?.lastInboundAt && nowUtc().getTime() - new Date(conversation.lastInboundAt).getTime() < SERVICE_WINDOW_MS;
  if (windowOpen) {
    const job = await enqueueJob(ctx, {
      connectionId: connection._id,
      type: SEND_WHATSAPP_TEXT,
      payload: { customerId: String(customer._id), text, replyToInboundAt: new Date(conversation.lastInboundAt).toISOString() },
      dedupeKey: `whatsapp:${key}`,
    });
    if (job) await recordReply(ctx, conversation._id, text);
    return { sent: 'message' };
  }
  try {
    return await sendTemplate({
      ...ctx,
      phone: customer.phone,
      templateKey: confirmed ? TEMPLATE_KEYS.BOOKING_CONFIRMED : TEMPLATE_KEYS.BOOKING_DECLINED,
      variables: confirmed ? { reference: doc.reference, date, time, partySize: String(doc.partySize) } : { reference: doc.reference, reason },
      idempotencyKey: key,
    });
  } catch {
    // No approved template yet: the guest sees it when they next write, or on a call.
    return null;
  }
}

export default { tellGuestAboutBooking };
