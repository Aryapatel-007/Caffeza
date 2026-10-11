/**
 * WhatsApp chats for staff. P39, API-CONTRACT "P39" section 6. OWNER, MANAGER
 * and CASHIER. No phone number in any address.
 */
import { Router } from 'express';

import { ROLES } from '../config/roles.js';
import { getChat, getChats, postChatReply, postClearStop, postDone, postHandBack } from '../controllers/chatController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/permission.js';
import { tenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { chatActionSchema, clearStopSchema, listChatsSchema, readChatSchema, replyToChatSchema } from '../validators/chatValidators.js';

const router = Router();
const staff = [authenticate, tenant, requireRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER)];

router.get('/chats', ...staff, validate(listChatsSchema), getChats);
router.get('/chats/:chatId', ...staff, validate(readChatSchema), getChat);
router.post('/chats/:chatId/reply', ...staff, validate(replyToChatSchema), postChatReply);
router.post('/chats/:chatId/hand-back', ...staff, validate(chatActionSchema), postHandBack);
router.post('/chats/:chatId/done', ...staff, validate(chatActionSchema), postDone);
router.post('/chats/:chatId/clear-stop', ...staff, validate(clearStopSchema), postClearStop);

export default router;
