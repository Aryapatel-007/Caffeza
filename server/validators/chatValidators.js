/**
 * WhatsApp chat request schemas. P39, API-CONTRACT "P39" section 6.
 */
import { z } from 'zod';

const chatId = z.object({ chatId: z.string().regex(/^[0-9a-f]{24}$/i, 'Is not a valid id.') });

export const listChatsSchema = z.object({ query: z.object({}).strict() });
export const readChatSchema = z.object({ params: chatId });
export const replyToChatSchema = z.object({
  params: chatId,
  body: z.object({ text: z.string().trim().min(1, 'Write a reply.').max(1000, 'Up to 1,000 characters.') }).strict(),
});
export const chatActionSchema = z.object({ params: chatId, body: z.object({}).strict().optional() });
export const clearStopSchema = z.object({ params: chatId, body: z.object({ reason: z.string().trim().min(1, 'Say why.').max(200) }).strict() });
