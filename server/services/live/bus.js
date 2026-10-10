/**
 * The live channel's announcer. P33, docs/API-CONTRACT.md "P33 The live channel".
 *
 * Holds no data and sends none: an announcement is a topic and a restaurant,
 * and a screen that hears it reads the topic again over ordinary HTTP. So a
 * lost announcement costs at most one poll interval, and an announcement can
 * never leak anything a read would not.
 *
 * One process, one Socket.IO server, no adapter: Render runs one instance. A
 * second instance would need a shared adapter (Redis, for one) so an
 * announcement on one reaches sockets on the other. Not added for an instance
 * that does not exist.
 *
 * This file imports no model, so the model plugin that calls it cannot form an
 * import cycle with the handshake in socketServer.js.
 */
import { logger } from '../../config/logger.js';

export const TOPICS = Object.freeze(['kots', 'tables', 'online', 'platform-orders', 'print-queue']);

/** Announcements for one restaurant and topic within this window go out as one. */
export const COALESCE_MS = 250;

let server = null;
const pending = new Map();

/** Set by socketServer.js once the socket server is listening; null switches announcing off. */
export function setLiveServer(io) {
  server = io;
  if (!io) {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
  }
}

export const restaurantRoom = (restaurantId) => `restaurant:${restaurantId}`;
export const branchRoom = (branchId) => `branch:${branchId}`;

/**
 * Announces that `topic` changed for a restaurant. Never throws, and does
 * nothing while the channel is off or nobody is connected.
 */
export function announce(topic, restaurantId, branchId = null) {
  try {
    if (!server || !restaurantId || !TOPICS.includes(topic)) return;
    const key = `${restaurantId}:${topic}`;
    const waiting = pending.get(key);
    if (waiting) {
      if (waiting.branchId !== (branchId ? String(branchId) : null)) waiting.branchId = null;
      return;
    }
    const entry = { branchId: branchId ? String(branchId) : null, timer: null };
    entry.timer = setTimeout(() => {
      pending.delete(key);
      try {
        server?.to(restaurantRoom(String(restaurantId))).emit('changed', { topic, restaurantId: String(restaurantId), branchId: entry.branchId });
      } catch (error) {
        logger.warn({ err: error, topic }, 'Could not send a live announcement.');
      }
    }, COALESCE_MS);
    entry.timer.unref?.();
    pending.set(key, entry);
  } catch (error) {
    logger.warn({ err: error, topic }, 'Could not queue a live announcement.');
  }
}
