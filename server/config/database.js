/**
 * MongoDB connection.
 *
 * The server does not listen until this succeeds. A half-connected API that
 * returns 500s looks the same as a broken one to a restaurant, but is harder
 * to diagnose.
 */
import mongoose from 'mongoose';

import { config } from './env.js';
import { logger } from './logger.js';

const MAX_CONNECT_ATTEMPTS = 5;
const FIRST_RETRY_DELAY_MS = 500;
const SERVER_SELECTION_TIMEOUT_MS = 5000;

// A filter that references a field the schema does not have is a mistake, not
// a silent match-everything. Same instinct as the tenant guard.
mongoose.set('strictQuery', 'throw');

// In production, indexes are built deliberately during a deploy, not on the
// first query after a restart. Building them automatically on a live server
// can lock a collection at exactly the wrong moment.
mongoose.set('autoIndex', !config.isProduction);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let listenersAttached = false;

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  const connection = mongoose.connection;
  connection.on('connected', () => logger.info('Database connected.'));
  connection.on('reconnected', () => logger.info('Database reconnected.'));
  connection.on('disconnected', () => logger.warn('Database disconnected.'));
  connection.on('error', (error) => logger.error({ err: error }, 'Database error.'));
}

/** True only when the driver is connected right now. Read live, never cached. */
export function isDatabaseConnected() {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/**
 * Connects, retrying with backoff. After the last attempt the process exits.
 * There is nothing useful this server can do without a database.
 */
export async function connectDatabase() {
  attachConnectionListeners();

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(config.MONGO_URI, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      });
      return mongoose.connection;
    } catch (error) {
      const isLastAttempt = attempt === MAX_CONNECT_ATTEMPTS;

      if (isLastAttempt) {
        logger.fatal(
          { err: error, attempt, maxAttempts: MAX_CONNECT_ATTEMPTS },
          'Could not connect to the database. Giving up.',
        );
        process.exit(1);
      }

      const delayMs = FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        { err: error, attempt, maxAttempts: MAX_CONNECT_ATTEMPTS, retryInMs: delayMs },
        'Database connection failed. Retrying.',
      );
      await sleep(delayMs);
    }
  }

  // Unreachable. The loop above either returns or exits.
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.disconnected) return;
  await mongoose.connection.close(false);
  logger.info('Database connection closed.');
}

/**
 * Closes the connection cleanly on SIGINT and SIGTERM.
 *
 * `beforeDisconnect` is where the caller stops accepting new requests. The
 * HTTP listener is closed first so an in-flight request is not cut off midway
 * through a database call.
 */
export function installShutdownHandlers(beforeDisconnect) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down.');
    try {
      if (typeof beforeDisconnect === 'function') await beforeDisconnect();
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error, signal }, 'Shutdown did not complete cleanly.');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
