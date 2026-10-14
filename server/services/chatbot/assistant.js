/**
 * One guest message to the WhatsApp assistant. P51 section 12.
 *
 * Runs as a job, from P37's webhook, never inside the webhook's own request.
 * The model understands the guest and words the reply; the tools act; the
 * reply check decides whether the reply may be sent. When the model cannot be
 * reached, or the day's limit is used, the guest gets the fixed menu instead.
 */
import { logger } from '../../config/logger.js';
import { Branch } from '../../models/Branch.js';
import { Conversation, CONVERSATION_STATUSES, TURN_ROLES, TURN_TEXT_MAX_LENGTH } from '../../models/Conversation.js';
import { Customer } from '../../models/Customer.js';
import { Restaurant } from '../../models/Restaurant.js';
import { businessDateFor, formatTimeIst12, nowUtc } from '../../utils/time.js';
import { getSettings } from '../settingsService.js';
import { enqueueJob } from '../integrations/jobRunner.js';
import { openChatFor, pushTurns, turn } from './chatTurns.js';
import { activeAiConnection, complete, messagesFromTurns } from './llm.js';
import { checkReply, splitOptions } from './replyCheck.js';
import { buildSystemPrompt, handoffHoursSentence } from './systemPrompt.js';
import { dateWords, openNow, pageLinkOf, runTool, TOOL_DEFINITIONS } from './tools.js';

export const SEND_WHATSAPP_TEXT = 'SEND_WHATSAPP_TEXT';
export const MAX_TOOL_ROUNDS = 4;
export const HISTORY_TURNS = 12;
export const FIXED_MENU = Object.freeze([
  { id: 'MENU_BOOK', title: 'Book a table' },
  { id: 'MENU_HOURS', title: 'Opening hours' },
  { id: 'MENU_STAFF', title: 'Talk to us' },
]);

const clip = (text) => String(text ?? '').slice(0, TURN_TEXT_MAX_LENGTH);

/** Queues one reply to the guest, inside the window their message opened. */
async function queueReply(ctx, connection, { customerId, conversationId, text, buttons = [], inboundAt, dedupe }) {
  await enqueueJob(ctx, {
    connectionId: connection._id,
    type: SEND_WHATSAPP_TEXT,
    payload: { customerId: String(customerId), text, buttons, replyToInboundAt: inboundAt.toISOString() },
    dedupeKey: dedupe,
  });
  await pushTurns(ctx, conversationId, [turn(TURN_ROLES.ASSISTANT, buttons.length ? `${text}\n[${buttons.map((button) => button.title).join(' | ')}]` : text, nowUtc())]);
}

async function siteFor(ctx) {
  const [branch, restaurant, settings] = await Promise.all([
    Branch.findOne({ restaurantId: ctx.restaurantId, _id: ctx.branchId }),
    Restaurant.findById(ctx.restaurantId),
    getSettings(ctx.restaurantId),
  ]);
  return { branch, restaurant, settings };
}

/** How many model calls the branch has made today, across its chats. */
async function aiCallsToday(ctx, today) {
  const [row] = await Conversation.aggregate([
    { $match: { restaurantId: ctx.restaurantIdObject, branchId: ctx.branchIdObject, aiCallsDate: today } },
    { $group: { _id: null, calls: { $sum: '$aiCallsToday' } } },
  ]);
  return row?.calls ?? 0;
}

function factsFor(site, customer, now) {
  const { restaurant, settings } = site;
  const today = businessDateFor(now, settings.business.businessDayStartsAtMinutes);
  return {
    restaurantName: restaurant.name,
    city: restaurant.address?.city ?? null,
    address: [restaurant.address?.line1, restaurant.address?.line2, restaurant.address?.city].filter(Boolean).join(', ') || null,
    restaurantPhone: restaurant.contactPhone || null,
    todayLong: dateWords(today),
    todayIso: today,
    timeNow: formatTimeIst12(now).toLowerCase(),
    openNowSentence: openNow(site, now).sentence,
    bookingsTaken: Boolean(settings.assistant.bookingsEnabled && settings.online.reservationsEnabled),
    pageLink: pageLinkOf(site),
    guestFirstName: customer.name ? customer.name.split(/\s+/)[0] : null,
    greeting: settings.assistant.greeting,
    handoffHours: settings.assistant.handoffHours,
  };
}

/** The three buttons, answered from the same tools, with no model. */
async function fixedMenu(ctx, toolCtx, { buttonId }) {
  const { restaurant, settings } = toolCtx.publicSite;
  const handoff = handoffHoursSentence(settings.assistant.handoffHours);
  if (buttonId === 'MENU_HOURS') {
    const info = await runTool('get_restaurant_info', {}, toolCtx);
    return { text: [`We are open ${info.todaysHours}; ${info.openSentence}.`, info.address ? `We are at ${info.address}.` : null].filter(Boolean).join(' '), buttons: [] };
  }
  if (buttonId === 'MENU_BOOK') {
    const link = pageLinkOf(toolCtx.publicSite);
    if (link && settings.online.reservationsEnabled) return { text: `You can book a table here: ${link}`, buttons: [] };
    await runTool('hand_to_staff', { reason: 'Wants to book a table' }, toolCtx);
    return { text: `A person from ${restaurant.name} will reply ${handoff} to book your table.`, buttons: [] };
  }
  if (buttonId === 'MENU_STAFF') {
    await runTool('hand_to_staff', { reason: 'Asked to talk to someone' }, toolCtx);
    return { text: `A person from ${restaurant.name} will reply ${handoff}.`, buttons: [] };
  }
  return { text: settings.assistant.greeting || `Hello from ${restaurant.name}. How can we help?`, buttons: FIXED_MENU };
}

/** Everything the reply may take facts from: this message's results, earlier results, the facts, the guest's words. */
function allowedText(system, conversation, guestText, ran) {
  const earlier = conversation.turns.filter((entry) => entry.role === TURN_ROLES.TOOL || entry.role === TURN_ROLES.STAFF).map((entry) => entry.text);
  return [system, guestText, ...earlier, ...ran.map((entry) => JSON.stringify(entry.result))].join('\n');
}

/** The model's reply to this message, through the tools and the check. Null when it cannot be had. */
async function modelReply(ctx, ai, toolCtx, conversation, guestText) {
  const system = buildSystemPrompt(factsFor(toolCtx.publicSite, toolCtx.customer, toolCtx.now));
  const history = messagesFromTurns(conversation.turns.slice(-HISTORY_TURNS));
  const messages = history.length ? history : [{ role: 'user', text: guestText }];
  let calls = 0;
  const call = (tools) => {
    calls += 1;
    return complete(ai, { system, messages, tools });
  };

  let attempt = 0;
  let reply = '';
  for (;;) {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const answer = await call(round < MAX_TOOL_ROUNDS ? TOOL_DEFINITIONS : []);
      if (answer.toolCalls.length === 0) {
        reply = answer.text;
        break;
      }
      messages.push({ role: 'assistant', text: answer.text, toolCalls: answer.toolCalls });
      const results = [];
      for (const toolCall of answer.toolCalls) results.push({ id: toolCall.id, name: toolCall.name, content: await runTool(toolCall.name, toolCall.arguments, toolCtx) });
      messages.push({ role: 'tool', results });
    }
    const customer = await Customer.findOne({ restaurantId: ctx.restaurantId, _id: toolCtx.customer._id }).lean();
    const check = checkReply(reply, {
      allowed: allowedText(system, conversation, guestText, toolCtx.ran),
      messagesAreStopped: customer?.offers?.given !== true || Boolean(customer?.whatsappStoppedAt),
    });
    if (check.ok || attempt >= 1) return { check, calls };
    attempt += 1;
    messages.push({ role: 'assistant', text: reply });
    messages.push({ role: 'user', text: `[Check by the restaurant's system, not the guest] Your reply was not sent: ${check.reasons.join(' ')} Write it again using only facts from the tools, and call the tool first if an action was needed.` });
  }
}

/**
 * Handles one INBOUND_MESSAGE event: `{ externalId, customerId, text, buttonId }`.
 * Returns what happened, for the job's result. Throws only when the database
 * does, so the job is retried.
 */
export async function handleInboundMessage(job, connection, event) {
  const now = nowUtc();
  const ctx = { restaurantId: job.restaurantId, branchId: job.branchId, restaurantIdObject: job.restaurantId, branchIdObject: job.branchId };
  if (!event.customerId) return { ignored: 'No guest.' };
  const customer = await Customer.findOne({ restaurantId: ctx.restaurantId, _id: event.customerId }).lean();
  if (!customer) return { ignored: 'No guest.' };

  const guestText = clip(event.text || (event.buttonId ? FIXED_MENU.find((button) => button.id === event.buttonId)?.title : '') || '');
  const conversation = await openChatFor(ctx, customer._id, guestText || '[A message the assistant cannot read]', now);
  if ([CONVERSATION_STATUSES.NEEDS_STAFF, CONVERSATION_STATUSES.STAFF].includes(conversation.status)) return { waiting: 'staff' };

  const site = await siteFor(ctx);
  // Off: nothing automatic; the chat waits in Chats for a person.
  if (!site.settings.assistant.enabled) return { assistant: 'off' };

  const toolCtx = { ...ctx, customer, conversation, publicSite: site, settings: site.settings, now, ran: [] };
  const reply = { dedupe: `whatsapp:reply:${event.externalId}`, inboundAt: now, customerId: customer._id, conversationId: conversation._id };

  // Not text: say what the assistant can read.
  if (!guestText) {
    await queueReply(ctx, connection, { ...reply, text: 'I can read text messages only. Please type your question.' });
    return { answered: 'not text' };
  }

  const today = businessDateFor(now, site.settings.business.businessDayStartsAtMinutes);
  const ai = await activeAiConnection(ctx);
  const overLimit = ai ? (await aiCallsToday(ctx, today)) >= site.settings.assistant.dailyAiLimit : true;

  let outcome = null;
  if (ai && !overLimit && !FIXED_MENU.some((button) => button.id === event.buttonId)) {
    try {
      outcome = await modelReply(ctx, ai, toolCtx, conversation, guestText);
      await Conversation.updateOne(
        { restaurantId: ctx.restaurantId, _id: conversation._id },
        conversation.aiCallsDate === today ? { $inc: { aiCallsToday: outcome.calls } } : { $set: { aiCallsDate: today, aiCallsToday: outcome.calls } },
      );
    } catch (error) {
      // The model could not be reached: the fixed menu answers instead.
      logger.warn({ restaurantId: String(ctx.restaurantId), reason: error?.message }, 'The assistant fell back to the fixed menu.');
      outcome = null;
    }
  }

  // The tools' results, kept for the next message in this chat.
  if (toolCtx.ran.length > 0) {
    await pushTurns(ctx, conversation._id, toolCtx.ran.map((entry) => turn(TURN_ROLES.TOOL, JSON.stringify(entry.result), nowUtc(), entry.name)));
  }

  let text;
  let buttons = [];
  if (outcome?.check?.ok) {
    ({ text } = outcome.check);
    buttons = outcome.check.buttons.map((title, index) => ({ id: `OPTION_${index + 1}`, title }));
  } else if (outcome) {
    // The model's reply failed the check twice: a person takes over.
    if (!toolCtx.handedOver) await runTool('hand_to_staff', { reason: `The assistant could not answer safely: ${outcome.check.reasons[0] ?? 'unclear'}` }, toolCtx);
    text = `Let me check that with the team. A person from ${site.restaurant.name} will reply ${handoffHoursSentence(site.settings.assistant.handoffHours)}.`;
  } else {
    ({ text, buttons } = await fixedMenu(ctx, toolCtx, { buttonId: event.buttonId }));
  }

  await queueReply(ctx, connection, { ...reply, text: splitOptions(text).text || text, buttons });
  return { answered: outcome ? (outcome.check.ok ? 'assistant' : 'handed over') : 'fixed menu', tools: toolCtx.ran.map((entry) => entry.name) };
}

export default { FIXED_MENU, handleInboundMessage };
