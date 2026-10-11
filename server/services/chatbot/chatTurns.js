/**
 * Writing a guest's chat. P39. Shared by the assistant, STOP, booking
 * messages and staff replies, so a chat is kept one way.
 */
import { Conversation, CONVERSATION_STATUSES, MAX_TURNS, TURN_ROLES, TURN_TEXT_MAX_LENGTH } from '../../models/Conversation.js';
import { nowUtc } from '../../utils/time.js';

const clip = (text) => String(text ?? '').slice(0, TURN_TEXT_MAX_LENGTH);

export const turn = (role, text, at, toolName = null) => ({ role, text: clip(text), at, toolName });

/** Adds turns, keeping the last 30, and moves the chat's last message on. */
export async function pushTurns(ctx, conversationId, turns, set = {}) {
  await Conversation.updateOne(
    { restaurantId: ctx.restaurantId, _id: conversationId },
    { $push: { turns: { $each: turns, $slice: -MAX_TURNS } }, $set: { lastMessageAt: turns.at(-1)?.at ?? nowUtc(), ...set } },
  );
}

/** The guest's chat, opened if new; their message kept; the 24-hour window open. */
export async function openChatFor(ctx, customerId, text, at) {
  const conversation = await Conversation.findOneAndUpdate(
    { restaurantId: ctx.restaurantId, branchId: ctx.branchId, customerId },
    {
      $setOnInsert: { restaurantId: ctx.restaurantId, branchId: ctx.branchId, customerId },
      $set: { lastInboundAt: at, lastMessageAt: at },
      $push: { turns: { $each: [turn(TURN_ROLES.GUEST, text, at)], $slice: -MAX_TURNS } },
    },
    { upsert: true, new: true },
  );
  // A chat closed by staff opens again when the guest writes.
  if (conversation.status === CONVERSATION_STATUSES.CLOSED) {
    conversation.status = CONVERSATION_STATUSES.BOT;
    await Conversation.updateOne({ restaurantId: ctx.restaurantId, _id: conversation._id }, { $set: { status: CONVERSATION_STATUSES.BOT } });
  }
  return conversation;
}

/** The restaurant's reply, kept in the chat. `role` ASSISTANT or STAFF. */
export function recordReply(ctx, conversationId, text, role = TURN_ROLES.ASSISTANT) {
  return pushTurns(ctx, conversationId, [turn(role, text, nowUtc())]);
}

export default { openChatFor, pushTurns, recordReply, turn };
