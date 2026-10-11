/**
 * WhatsApp chats for staff. P39, API-CONTRACT "P39" section 6. Every rule is
 * in services/chatbot/chatService.js.
 */
import { clearStop, closeChat, handBack, listChats, readChat, replyToChat } from '../services/chatbot/chatService.js';
import { sendSuccess } from '../utils/response.js';

export async function getChats(req, res) {
  return sendSuccess(res, await listChats(req));
}

export async function getChat(req, res) {
  return sendSuccess(res, await readChat(req, req.params.chatId));
}

export async function postChatReply(req, res) {
  return sendSuccess(res, await replyToChat(req, req.params.chatId, req.body));
}

export async function postHandBack(req, res) {
  return sendSuccess(res, await handBack(req, req.params.chatId));
}

export async function postDone(req, res) {
  return sendSuccess(res, await closeChat(req, req.params.chatId));
}

export async function postClearStop(req, res) {
  return sendSuccess(res, await clearStop(req, req.params.chatId, req.body));
}
