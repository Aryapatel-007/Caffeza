/**
 * Replication's timers, started once by server.js. P62.
 *
 *   every role  the writer state, read every 10 seconds
 *   BOX         the clock check (boot, then every minute)
 *               the changelog writer (every half second)
 *               with MIRROR_URL: the shipper (every second, backing off on
 *               failure), the intake puller (every 3 seconds, backing off),
 *               and reconciliation (every 30 minutes)
 *   MIRROR      nothing more: it answers the box
 *
 * P63, SYNC_MODE=TWO_WAY:
 *   BOX         the clock check and the changelog writer as above, then every
 *               second, per restaurant: pull the cloud's changes, then push its
 *               own. No intake puller (the cloud takes online orders itself)
 *               and no reconciliation (two writers differ for seconds by design)
 *   CLOUD       the changelog writer; it answers the box's pulls and pushes
 *
 * None of it is in a request's path. A failed round is logged and the next
 * one tries again; nothing here can stop the till.
 */
import mongoose from 'mongoose';

import { currentRole, ROLES } from '../../config/deployment.js';
import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { businessDateFor, nowUtc } from '../../utils/time.js';
import { pullIntakeOnce } from '../intake/boxIntake.js';
import { pullOnce } from '../sync/exchange.js';
import { isTwoWay } from '../sync/mode.js';
import { ChangelogWriter } from './changelogWriter.js';
import { CLOCK_CHECK_EVERY_MS, checkClock } from './clockGuard.js';
import { reconcileOnce } from './reconcile.js';
import { RETRY_DELAYS_MS, Shipper } from './shipper.js';
import { loadWriterState, startWriterStateRefresh, stopWriterStateRefresh } from './writerState.js';

export const WRITER_PUMP_MS = 500;
export const SHIP_EVERY_MS = 1_000;
export const PULL_EVERY_MS = 3_000;
export const RECONCILE_EVERY_MS = 30 * 60_000;
const PULL_BACKOFF_MS = Object.freeze([3_000, 10_000, 30_000, 60_000]);

const timers = [];
let writer = null;

function every(ms, name, fn) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (error) {
      logger.warn({ err: error }, `${name} failed a round.`);
    } finally {
      busy = false;
    }
  }, ms);
  timer.unref?.();
  timers.push(timer);
}

async function localRestaurantIds() {
  const docs = await mongoose.connection.db.collection('restaurants').find({}, { projection: { _id: 1 } }).toArray();
  return docs.map((doc) => doc._id);
}

/** Records what the change stream has waiting now. The appliers call it first. */
export async function pumpChangelog() {
  if (writer) await writer.pump();
}

async function startChangelogWriter() {
  writer = new ChangelogWriter();
  logger.info({ start: await writer.start() }, 'Changelog writer started.');
  every(WRITER_PUMP_MS, 'The changelog writer', () => writer.pump());
}

/** P63. The box's round: pull then push, for every restaurant, backing off when the cloud is away. */
function startTwoWayExchange() {
  const shipper = new Shipper();
  let failures = 0;
  let nextAt = 0;
  every(SHIP_EVERY_MS, 'The two-way sync', async () => {
    if (Date.now() < nextAt) return;
    let failed = false;
    for (const restaurantId of await localRestaurantIds()) {
      for (let round = 0; round < 50; round += 1) {
        const outcome = await pullOnce(restaurantId, { pump: pumpChangelog });
        if (outcome === 'FAILED') failed = true;
        if (outcome !== 'PULLED') break;
      }
    }
    await writer?.pump();
    const shipped = await shipper.tick();
    if (shipped?.some((outcome) => outcome === 'FAILED')) failed = true;
    failures = failed ? failures + 1 : 0;
    nextAt = failed ? Date.now() + RETRY_DELAYS_MS[Math.min(failures - 1, RETRY_DELAYS_MS.length - 1)] : 0;
  });
}

export async function startReplication() {
  await loadWriterState();
  startWriterStateRefresh();
  if (isTwoWay() && currentRole() === ROLES.CLOUD) {
    await startChangelogWriter();
    logger.info('Two-way sync: this cloud writes and keeps a changelog for the cafe PC to pull.');
    return;
  }
  if (currentRole() !== ROLES.BOX) return;

  await checkClock();
  every(CLOCK_CHECK_EVERY_MS, 'The clock check', () => checkClock());

  await startChangelogWriter();

  if (!config.MIRROR_URL || !config.REPLICATION_SECRET) {
    logger.warn('MIRROR_URL is not set: the changelog is kept on this box and nothing is shipped. docs/REPLICATION.md section 5.');
    return;
  }

  if (isTwoWay()) {
    startTwoWayExchange();
    logger.info({ cloud: config.MIRROR_URL }, 'Two-way sync with the cloud started.');
    return;
  }

  const shipper = new Shipper();
  every(SHIP_EVERY_MS, 'The shipper', () => shipper.tick());

  let pullFailures = 0;
  let pullAfter = 0;
  every(PULL_EVERY_MS, 'The intake puller', async () => {
    if (Date.now() < pullAfter) return;
    try {
      await pullIntakeOnce();
      pullFailures = 0;
    } catch (error) {
      pullFailures += 1;
      pullAfter = Date.now() + PULL_BACKOFF_MS[Math.min(pullFailures - 1, PULL_BACKOFF_MS.length - 1)];
      throw error;
    }
  });

  every(RECONCILE_EVERY_MS, 'Reconciliation', async () => {
    const today = businessDateFor(nowUtc());
    for (const restaurantId of await localRestaurantIds()) await reconcileOnce(restaurantId, { businessDate: today });
  });
}

export async function stopReplication() {
  for (const timer of timers.splice(0)) clearInterval(timer);
  stopWriterStateRefresh();
  if (writer) {
    // What the stream has waiting goes into the changelog before the database closes.
    await writer.pump().catch(() => {});
    await writer.close();
    writer = null;
  }
}
