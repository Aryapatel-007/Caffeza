/**
 * The one place any module reads configuration from.
 *
 * No controller reads `restaurant.settings` directly. Same discipline as no
 * controller reading the environment and no controller touching `passwordHash`:
 * when a setting moves, gains a default, or changes shape, one file changes.
 *
 * `restaurants` is the documented tenancy-root exception and carries neither
 * baseSchema nor tenantGuard, so every query here is by `_id` taken from a
 * verified token. That is legitimate unguarded pattern 1 from the note at the
 * top of models/Restaurant.js. This module needs no tenant-guard escape hatch
 * of any kind: `restaurants` has no guard to skip, and the audit writes go
 * through auditService, which is an ordinary scoped write. The production count
 * of that hatch is unchanged by M7, and there is a tripwire asserting it.
 */
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Restaurant } from '../models/Restaurant.js';
import { recordAudit } from './auditService.js';
import { withOptionalTransaction } from '../utils/transaction.js';

/**
 * Every setting, as the API path a client sees mapped to the path it is stored
 * at. This map is the whole reason the two shapes can differ safely.
 *
 * `business.businessDayStartsAtMinutes` is the one entry where the two differ.
 * The field is stored at the top level of `settings` because M3, M5 and M6 all
 * read it there, and the API groups it under `business` for readability. See
 * models/Restaurant.js for why it never moves. Every other entry is the same
 * path with a `settings.` prefix.
 *
 * Adding a setting means adding one line here, one field on the model, and one
 * field in the validator. Nothing else in the codebase needs to know.
 */
const SETTING_PATHS = Object.freeze({
  'business.businessDayStartsAtMinutes': 'settings.businessDayStartsAtMinutes',

  'tax.pricingMode': 'settings.tax.pricingMode',
  'tax.defaultTaxRateBps': 'settings.tax.defaultTaxRateBps',
  'tax.roundOffEnabled': 'settings.tax.roundOffEnabled',

  'receipt.headerLine1': 'settings.receipt.headerLine1',
  'receipt.headerLine2': 'settings.receipt.headerLine2',
  'receipt.footerText': 'settings.receipt.footerText',
  'receipt.showGstin': 'settings.receipt.showGstin',
  'receipt.showFssai': 'settings.receipt.showFssai',
  'receipt.showServerName': 'settings.receipt.showServerName',

  'inventory.lowStockAlertsEnabled': 'settings.inventory.lowStockAlertsEnabled',
});

export const SETTING_API_PATHS = Object.freeze(Object.keys(SETTING_PATHS));

/** Walks a dotted path. Returns undefined rather than throwing on a missing branch. */
function valueAt(source, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), source);
}

/** Writes a dotted path into a plain object, creating the branches it needs. */
function setValueAt(target, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => {
    node[key] ??= {};
    return node[key];
  }, target);
  parent[last] = value;
}

/**
 * The settings object as the API describes it, built from a restaurant document.
 *
 * A document written before M7 has no `settings.tax` at all. Mongoose fills
 * every missing path from the schema defaults when it hydrates the document, so
 * this reads a complete object without a migration and without a seeding step.
 * There is a test asserting exactly that.
 *
 * A missing restaurant returns the pure defaults rather than throwing, which is
 * what every call site did for itself before this service existed
 * (`restaurant?.settings?.x ?? DEFAULT`), and changing that here would change
 * three modules' behaviour by accident.
 */
let defaultSettings;

/** The schema's own defaults, built once. Static by definition. */
function schemaDefaults() {
  defaultSettings ??= new Restaurant().settings;
  return defaultSettings;
}

function presentSettings(restaurant) {
  const defaults = schemaDefaults();
  const source = restaurant ?? { settings: defaults };

  const presented = {};
  for (const [apiPath, storedPath] of Object.entries(SETTING_PATHS)) {
    const value = valueAt(source, storedPath) ?? valueAt({ settings: defaults }, storedPath) ?? null;
    setValueAt(presented, apiPath, value);
  }
  return presented;
}

/**
 * Per-request memo, so one request that reads a setting three times reads the
 * document once.
 *
 * DELIBERATELY NOT A PROCESS-LEVEL CACHE WITH A TIME TO LIVE. A stale settings
 * cache means an owner changes the business day boundary, sees nothing happen,
 * changes it again, and two server processes now disagree about which day a
 * sale belongs to. BUILD-PLAN section 12 lists that as its own named problem.
 * The cache dies with the request, every time.
 */
const CACHE_KEY = Symbol.for('restaurantErp.settingsCache');

function cached(req, restaurantId) {
  if (!req) return undefined;
  return req[CACHE_KEY]?.get(String(restaurantId));
}

function remember(req, restaurantId, settings) {
  if (!req) return settings;
  req[CACHE_KEY] ??= new Map();
  req[CACHE_KEY].set(String(restaurantId), settings);
  return settings;
}

/** Drops the memo after a write, so a read later in the same request sees the change. */
function forget(req, restaurantId) {
  req?.[CACHE_KEY]?.delete(String(restaurantId));
}

/**
 * The full settings object for one restaurant, with every default applied.
 *
 * Pass `{ req }` to get the per-request memo and, where `authenticate` already
 * loaded the restaurant onto the request, to skip the query entirely. That is
 * the common case: this service is usually reading a document the request has
 * in hand, and re-fetching it would be a query per setting read.
 */
export async function getSettings(restaurantId, { req = null } = {}) {
  const memo = cached(req, restaurantId);
  if (memo) return memo;

  // authenticate loads the whole document, so the settings are already here.
  const loaded = req?.currentRestaurant;
  const restaurant =
    loaded && String(loaded._id) === String(restaurantId)
      ? loaded
      : // Legitimate unguarded query pattern 1: by _id from a verified token.
        await Restaurant.findById(restaurantId).select('settings');

  return remember(req, restaurantId, presentSettings(restaurant));
}

/**
 * One setting by its dotted API path, for example "tax.defaultTaxRateBps".
 *
 * An unknown path is a programming error, not a client error, so it throws
 * rather than returning undefined and letting a wrong value travel.
 */
export async function getSetting(restaurantId, path, { req = null } = {}) {
  if (!(path in SETTING_PATHS)) {
    throw new Error(`"${path}" is not a setting. See SETTING_PATHS in settingsService.js.`);
  }
  return valueAt(await getSettings(restaurantId, { req }), path);
}

/**
 * Applies a patch, writes one audit line per field that actually changed, and
 * returns the full updated object.
 *
 * Only changed fields are written and only changed fields are audited. A field
 * sent with the value it already has is not an error and not a change; auditing
 * it would fill the log with noise and make the real changes harder to find.
 *
 * The settings write and every audit line commit together. A settings change
 * that persists without its audit line is worse than one that fails outright,
 * because the log is the thing that is trusted.
 */
export async function updateSettings(
  restaurantId,
  patch,
  { actorId, actorRole, branchId, reason, req = null } = {},
) {
  const before = await getSettings(restaurantId, { req: null });

  const changes = [];
  for (const apiPath of SETTING_API_PATHS) {
    const next = valueAt(patch, apiPath);
    if (next === undefined) continue;

    const previous = valueAt(before, apiPath);
    if (previous === next) continue;

    changes.push({ apiPath, storedPath: SETTING_PATHS[apiPath], previous, next });
  }

  if (changes.length === 0) {
    forget(req, restaurantId);
    return before;
  }

  const $set = Object.fromEntries(changes.map((change) => [change.storedPath, change.next]));

  /**
   * auditService takes the request because every other caller has one. This one
   * does not, so it is handed the same three things the function actually reads:
   * the tenant, the actor, and the actor's role at the time. Reshaping
   * auditService for one caller would touch M3 code this module has no business
   * touching.
   */
  const auditContext = {
    restaurantId,
    branchId,
    user: { id: actorId, role: actorRole },
  };

  const updated = await withOptionalTransaction(async (session) => {
    // Legitimate unguarded query pattern 1: by _id from a verified token.
    const restaurant = await Restaurant.findOneAndUpdate({ _id: restaurantId }, { $set }, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    });

    for (const change of changes) {
      await recordAudit(
        auditContext,
        {
          action: AUDIT_ACTIONS.SETTINGS_CHANGED,
          entityType: AUDIT_ENTITY_TYPES.SETTINGS,
          entityId: restaurantId,
          entityLabel: change.apiPath,
          reason,
          amountInPaise: null,
          // A field path and two scalars. No personal data goes in here, for
          // the reason DB-SCHEMA section 13 gives.
          details: {
            field: change.apiPath,
            previousValue: String(change.previous),
            newValue: String(change.next),
          },
        },
        session,
      );
    }

    return restaurant;
  });

  forget(req, restaurantId);
  return presentSettings(updated);
}

export default { getSettings, getSetting, updateSettings };
