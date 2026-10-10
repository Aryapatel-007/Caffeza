/**
 * The live channel's socket server. P33, docs/API-CONTRACT.md "P33 The live channel".
 *
 * The handshake makes exactly the checks `authenticate` makes, in the same
 * order, with the same helpers. The rooms come from the verified token, never
 * from anything the client sends: a client naming its own room is the tenant
 * leak this codebase exists to prevent. The connection closes when the access
 * token expires, the socket's version of `authenticate` reading the role from
 * the database: a demoted or deactivated user keeps no live channel for the
 * rest of a fifteen-minute token.
 *
 * Every 20 seconds each socket is checked again and sent a heartbeat. A screen
 * that hears nothing for 30 seconds treats the channel as dead and polls at its
 * own interval: the 2026-08-29 decision feared a socket that silently stops
 * delivering, and the heartbeat is what catches one.
 *
 * Sockets are attached to the HTTP server directly, ahead of Express, so the
 * general and per-user rate limiters never count them. One process, no
 * adapter: see bus.js.
 */
import { Server } from 'socket.io';

import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { issuedBeforePasswordChange, readClaims } from '../../middleware/authenticate.js';
import { Restaurant } from '../../models/Restaurant.js';
import { User } from '../../models/User.js';
import { verifyAccessToken } from '../tokenService.js';
import { branchRoom, restaurantRoom, setLiveServer } from './bus.js';

export const LIVE_PATH = '/api/v1/live';
export const HEARTBEAT_MS = 20_000;
export const MAX_CONNECTIONS_PER_USER = 5;

/** The longest a timer may be set for; a token living longer is closed then re-checked. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Why a socket may not connect or stay, or null when it may. The same checks as `authenticate`, in its order. */
async function refusalFor(claims) {
  const [user, restaurant] = await Promise.all([
    User.findOne({ _id: claims.id, restaurantId: claims.restaurantId }),
    // Legitimate unguarded query pattern 1: lookup by _id from a verified token.
    Restaurant.findById(claims.restaurantId),
  ]);
  if (!user || user.isActive === false) return 'UNAUTHENTICATED';
  if (issuedBeforePasswordChange(claims.issuedAtSeconds, user.passwordChangedAt)) return 'TOKEN_EXPIRED';
  if (!restaurant || restaurant.isActive === false) return 'UNAUTHENTICATED';
  return null;
}

/** The verified claims of a handshake, or the code it is refused with. */
function claimsFor(token) {
  if (typeof token !== 'string' || token.length === 0) return { refusal: 'UNAUTHENTICATED' };
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    return { refusal: error?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED' };
  }
  const claims = readClaims(payload);
  if (!claims || typeof payload.exp !== 'number') return { refusal: 'UNAUTHENTICATED' };
  return { claims: { ...claims, expiresAtSeconds: payload.exp } };
}

/**
 * Starts the live channel on an HTTP server, unless LIVE_CHANNEL is off.
 * Returns the Socket.IO server, or null when switched off.
 */
export function attachLiveChannel(httpServer, { heartbeatMs = HEARTBEAT_MS, enabled = config.LIVE_CHANNEL === 'on' } = {}) {
  if (!enabled) {
    setLiveServer(null);
    logger.info('Live channel off (LIVE_CHANNEL=off). Screens poll at their own intervals.');
    return null;
  }

  const io = new Server(httpServer, {
    path: LIVE_PATH,
    transports: ['websocket'],
    serveClient: false,
    cors: { origin: config.CLIENT_ORIGIN },
    // Socket.IO's own ping keeps the connection open through proxies; the
    // heartbeat below is ours, and it is the one screens trust.
    pingInterval: 25_000,
  });
  const perUser = new Map();

  io.use(async (socket, next) => {
    try {
      const { claims, refusal } = claimsFor(socket.handshake.auth?.token);
      if (refusal) return next(new Error(refusal));
      const reason = await refusalFor(claims);
      if (reason) return next(new Error(reason));
      if ((perUser.get(claims.id) ?? 0) >= MAX_CONNECTIONS_PER_USER) return next(new Error('TOO_MANY_CONNECTIONS'));
      socket.data.claims = claims;
      return next();
    } catch (error) {
      logger.warn({ err: error }, 'Live channel handshake failed.');
      return next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const { claims } = socket.data;
    perUser.set(claims.id, (perUser.get(claims.id) ?? 0) + 1);
    // From the verified token only. Nothing in the handshake names a room.
    socket.join(restaurantRoom(claims.restaurantId));
    socket.join(branchRoom(claims.branchId));

    const untilExpiry = Math.min(Math.max(0, claims.expiresAtSeconds * 1000 - Date.now()), MAX_TIMER_MS);
    const expiry = setTimeout(() => socket.disconnect(true), untilExpiry);

    const heartbeat = setInterval(async () => {
      try {
        const reason = await refusalFor(claims);
        if (reason) socket.disconnect(true);
        else socket.emit('heartbeat', { at: Date.now() });
      } catch (error) {
        // Unsure is not healthy: no heartbeat, so the screen polls at its own interval.
        logger.warn({ err: error }, 'Live channel heartbeat check failed.');
      }
    }, heartbeatMs);

    socket.emit('heartbeat', { at: Date.now() });

    socket.on('disconnect', () => {
      clearTimeout(expiry);
      clearInterval(heartbeat);
      const left = (perUser.get(claims.id) ?? 1) - 1;
      if (left > 0) perUser.set(claims.id, left);
      else perUser.delete(claims.id);
    });
  });

  setLiveServer(io);
  logger.info({ path: LIVE_PATH }, 'Live channel on.');
  return io;
}

/** Stops the live channel and closes every socket, leaving the HTTP server running. For tests and shutdown. */
export function closeLiveChannel(io) {
  setLiveServer(null);
  if (!io) return;
  io.disconnectSockets(true);
  io.engine.close();
}
