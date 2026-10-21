/**
 * What the dashboard and every device's top bar show about the network and the
 * cloud copy. P62 sections 7 and the network additions.
 *
 *   self    for any signed-in person: is this server the writer, is its clock
 *           right, is the cloud copy keeping up. Staff see "Synced" or
 *           "12 waiting to upload"; only OWNER and MANAGER see the backup
 *           alert, the reconciliation result and the reason.
 *   status  for OWNER and MANAGER: the box's WiFi and addresses, the staff
 *           setup details, every connected device with its strength, and the
 *           whole sync picture.
 *   setup   for anyone, no sign-in: the address to open and the WiFi to join,
 *           never a password. The /connect page and a lost tablet read this.
 */
import { config } from '../../config/env.js';
import { currentRole, ROLES } from '../../config/deployment.js';
import { ROLES as STAFF_ROLES } from '../../config/roles.js';
import { REPLICATION_STATE_IDS, ReplicationState } from '../../models/ReplicationState.js';
import { nowUtc } from '../../utils/time.js';
import { clockSnapshot } from '../replication/clockGuard.js';
import { mirrorPosition } from '../replication/receiver.js';
import { shippingLag } from '../replication/shipper.js';
import { writerSnapshot } from '../replication/writerState.js';
import { listDevices } from './devicePresence.js';
import { readNetworkNotes } from './networkStore.js';
import { wifiStatus } from './wifiService.js';

/** Past this, "not synced" is a backup problem the owner must see. P62 section 7. */
export const NOT_SYNCED_ALERT_AFTER_SECONDS = 3 * 60 * 60;
/** Past this, the mirror's figures carry a warning beside their "as of". */
export const MIRROR_FIGURES_STALE_AFTER_SECONDS = 15 * 60;

const MANAGERS = new Set([STAFF_ROLES.OWNER, STAFF_ROLES.MANAGER]);

/** The sync state in one word the top bar can draw. */
export function syncState(lag, { shipping }) {
  if (!shipping) return 'LOCAL_ONLY';
  if (lag.entriesWaiting === 0) return 'SYNCED';
  if (lag.secondsBehind >= NOT_SYNCED_ALERT_AFTER_SECONDS) return 'NOT_SYNCED';
  return 'WAITING';
}

async function boxSync(restaurantId) {
  const shipping = Boolean(config.MIRROR_URL && config.REPLICATION_SECRET);
  const lag = await shippingLag(restaurantId);
  const reconcile = await ReplicationState.findById(REPLICATION_STATE_IDS.reconcile(restaurantId)).lean();
  return {
    state: syncState(lag, { shipping }),
    entriesWaiting: lag.entriesWaiting,
    secondsBehind: lag.secondsBehind,
    syncedThrough: lag.syncedThrough,
    lastError: lag.lastError,
    lastErrorAt: lag.lastErrorAt,
    reconcile: reconcile ? { status: reconcile.status, checkedAt: reconcile.checkedAt, mismatches: reconcile.mismatches ?? [] } : null,
  };
}

async function mirrorSync(restaurantId) {
  const position = await mirrorPosition(restaurantId);
  const ageSeconds = position.figuresAsOf ? Math.max(Math.round((nowUtc().getTime() - new Date(position.figuresAsOf).getTime()) / 1000), 0) : null;
  return {
    state: position.gap ? 'GAP' : 'MIRROR',
    figuresAsOf: position.figuresAsOf,
    ageSeconds,
    stale: ageSeconds === null || ageSeconds > MIRROR_FIGURES_STALE_AFTER_SECONDS,
    gap: position.gap,
  };
}

/** For every signed-in person. */
export async function selfStatus(req) {
  const role = currentRole();
  const writer = writerSnapshot();
  const manager = MANAGERS.has(req.user?.role);
  const view = {
    role,
    serverTime: nowUtc(),
    writer: { epoch: writer.epoch, fenced: writer.fenced, readOnly: role === ROLES.MIRROR && !writer.promoted, promoted: writer.promoted },
    clock: { refusing: role === ROLES.BOX && clockSnapshot().refusing },
    sync: null,
  };
  if (role === ROLES.BOX) {
    const sync = await boxSync(req.restaurantId);
    view.sync = manager
      ? sync
      : { state: sync.state === 'NOT_SYNCED' ? 'WAITING' : sync.state, entriesWaiting: sync.entriesWaiting };
  } else if (role === ROLES.MIRROR) {
    view.sync = await mirrorSync(req.restaurantId);
  }
  return view;
}

function urls() {
  return { boxUrl: config.BOX_PUBLIC_URL, localNameUrl: config.BOX_LOCAL_NAME_URL };
}

/** For OWNER and MANAGER: everything the network card shows. */
export async function fullStatus(req) {
  const [self, notes, box] = await Promise.all([selfStatus(req), readNetworkNotes(), currentRole() === ROLES.BOX ? wifiStatus() : null]);
  return {
    ...self,
    box,
    ...urls(),
    staffWifi: notes.staffWifi,
    devices: listDevices(req.restaurantId),
  };
}

/** For anyone. No password, ever. */
export async function publicSetup() {
  const notes = await readNetworkNotes();
  let wifiName = notes.staffWifi?.ssid ?? null;
  if (!wifiName && currentRole() === ROLES.BOX) wifiName = (await wifiStatus()).ssid;
  return { role: currentRole(), ...urls(), wifiName };
}
