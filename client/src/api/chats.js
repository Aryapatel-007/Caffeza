/**
 * WhatsApp chats, the staff side. P51, API-CONTRACT "P51" section 6. A chat
 * names its guest by first name only; no phone number reaches a screen.
 */
import { api } from './client.js';

export const listChats = () => api.get('/chats');
export const getChat = (chatId) => api.get(`/chats/${chatId}`);
export const replyToChat = (chatId, text) => api.post(`/chats/${chatId}/reply`, { text });
export const handBackChat = (chatId) => api.post(`/chats/${chatId}/hand-back`, {});
export const closeChat = (chatId) => api.post(`/chats/${chatId}/done`, {});
export const clearChatStop = (chatId, reason) => api.post(`/chats/${chatId}/clear-stop`, { reason });
