/**
 * Server entry.
 *
 * Boot order: validate the environment, connect to the database, then listen.
 * Never listen before the database is up. An API that accepts requests it
 * cannot serve is harder to diagnose than one that is plainly not running.
 *
 * The middleware order below is the order in docs/CONVENTIONS.md section 8.
 * It is not arbitrary. Security headers before anything writes a response,
 * body parsing before anything reads a body, logging before the rate limiter
 * so a blocked request still appears in the log, and the error handler last so
 * it catches everything in front of it.
 */
import { pathToFileURL } from 'node:url';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { connectDatabase, installShutdownHandlers } from './config/database.js';
import { config } from './config/env.js';
import { httpLogger, logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalLimiter } from './middleware/rateLimit.js';
import routes from './routes/index.js';
import { describeKey, findMissingIndexes } from './services/indexService.js';

export const API_PREFIX = '/api/v1';

/**
 * A price, a name and a few ids. Nothing this API accepts is large, and a
 * generous limit is free capacity for someone else.
 */
const JSON_BODY_LIMIT = '100kb';

/**
 * Builds the app without starting it.
 *
 * Exported so tests can drive the real middleware chain without a database or
 * an open port. The app is exactly the one that runs in production.
 */
export function createApp() {
  const app = express();

  // Do not advertise what we are running.
  app.disable('x-powered-by');

  // TODO(deploy): behind a reverse proxy or a load balancer, set
  // app.set("trust proxy", 1) or every client shares one IP and the rate
  // limiter becomes useless. Left off until we know the hosting shape, because
  // trusting a forwarded header that nobody is setting is worse than not
  // trusting it. Hosting is an open question in docs/PROJECT-STATE.md.

  app.use(helmet());

  // credentials is on for the refresh token cookie that arrives in M0 part B.
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(httpLogger);
  app.use(generalLimiter);

  app.use(API_PREFIX, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    try {
      server.close((error) => (error ? reject(error) : resolve()));
    } catch (error) {
      if (error.code === 'ERR_SERVER_NOT_RUNNING') {
        resolve();
      } else {
        reject(error);
      }
    }
  });
}

/**
 * A crash we did not predict leaves the process in an unknown state. Log it
 * and stop, rather than continuing to serve from a process that may be holding
 * a half-finished transaction.
 */
function installCrashHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection. Stopping.');
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception. Stopping.');
    process.exit(1);
  });
}

/**
 * Refuses to start a production server whose database is missing an index.
 *
 * `autoIndex` is off in production, so nothing builds indexes on boot, and the
 * unique ones are what stop a duplicate bill number, a second open order on a
 * table and a double stock deduction. A server running without them looks
 * perfectly healthy until the day two of those collide. There is deliberately
 * no setting that skips this check. Development and test skip it only because
 * `autoIndex` builds the indexes there already.
 */
async function assertIndexesPresent() {
  if (!config.isProduction) return;

  const { missing, extra } = await findMissingIndexes();

  for (const index of extra) {
    logger.warn(
      { collection: index.collection, index: index.name },
      'Index in the database that no schema declares. Left alone.',
    );
  }

  if (missing.length === 0) return;

  for (const index of missing) {
    logger.fatal(
      { collection: index.collection, key: describeKey(index.key) },
      'Index missing from the database.',
    );
  }
  logger.fatal('Indexes are missing. Run npm run db:indexes against this database, then start again.');
  process.exit(1);
}

export async function startServer() {
  installCrashHandlers();

  await connectDatabase();
  await assertIndexesPresent();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, environment: config.NODE_ENV, api: API_PREFIX },
      'Server listening.',
    );
  });

  // The listener closes first so an in-flight request is not cut off partway
  // through a database call.
  installShutdownHandlers(() => closeHttpServer(server));

  return server;
}

const isDirectRun =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  await startServer();
}
