/**
 * Item mapping: which of our dishes a platform's item is. P25 Part H,
 * API-CONTRACT M21 section 7.2. A mapping is configuration, like a recipe,
 * and is removed outright.
 */
import { IntegrationConnection } from '../../models/IntegrationConnection.js';
import { MenuItem } from '../../models/MenuItem.js';
import { PlatformItemMapping } from '../../models/PlatformItemMapping.js';
import { PlatformOrder } from '../../models/PlatformOrder.js';
import { parseCsv } from '../../utils/csv.js';
import { BusinessRuleError, NotFoundError } from '../../utils/errors.js';
import { scoped } from '../../utils/scopedQuery.js';
import { nowUtc } from '../../utils/time.js';
import { PROVIDER_KINDS, providerFor } from './providers.js';

async function channelConnection(req, provider) {
  if (providerFor(provider)?.kind !== PROVIDER_KINDS.ORDER_CHANNEL) throw new NotFoundError('Only a delivery platform has item mappings.');
  const connection = await IntegrationConnection.findOne({ ...scoped(req), provider });
  if (!connection) throw new NotFoundError('This platform is not set up yet.');
  return connection;
}

/** The dish, size and extras must be this restaurant's: 422 otherwise. */
async function assertOurs(req, { menuItemId, variantId = null, addOnMap = {} }) {
  const item = await MenuItem.findOne({ ...scoped(req), _id: menuItemId }).select('variants addOns').lean();
  if (!item) throw new BusinessRuleError('That dish is not on this menu.');
  if (variantId && !item.variants.some((variant) => String(variant._id) === String(variantId))) {
    throw new BusinessRuleError('That size is not on this dish.');
  }
  for (const ours of Object.values(addOnMap ?? {})) {
    if (!item.addOns.some((addOn) => String(addOn._id) === String(ours))) throw new BusinessRuleError('An extra is not on this dish.');
  }
}

export async function listMappings(req, provider, { page = 1, limit = 50 }) {
  const connection = await channelConnection(req, provider);
  const filter = { ...scoped(req), connectionId: connection._id };
  const [rows, total] = await Promise.all([
    PlatformItemMapping.find(filter).sort({ externalName: 1 }).skip((page - 1) * limit).limit(limit),
    PlatformItemMapping.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
}

/** PUT: creates or replaces the mapping for one external item and variant. */
export async function saveMapping(req, provider, { externalItemId, externalVariantId = null, externalName = null, menuItemId, variantId = null, addOnMap = {} }) {
  const connection = await channelConnection(req, provider);
  await assertOurs(req, { menuItemId, variantId, addOnMap });
  return PlatformItemMapping.findOneAndUpdate(
    { ...scoped(req), connectionId: connection._id, externalItemId, externalVariantId },
    {
      $set: { menuItemId, variantId, addOnMap, ...(externalName ? { externalName } : {}) },
      $setOnInsert: { restaurantId: req.restaurantId, branchId: req.branchId, connectionId: connection._id, externalItemId, externalVariantId },
    },
    { upsert: true, new: true },
  );
}

export async function deleteMapping(req, provider, mappingId) {
  const connection = await channelConnection(req, provider);
  const deleted = await PlatformItemMapping.findOneAndDelete({ ...scoped(req), connectionId: connection._id, _id: mappingId });
  if (!deleted) throw new NotFoundError('Mapping not found.');
  return { id: String(deleted._id) };
}

/**
 * Every external item seen in a platform order with no mapping, newest first,
 * with its last name and how many orders it was in. Read from the orders, so
 * nothing is stored twice.
 */
export async function unmappedItems(req, provider) {
  const connection = await channelConnection(req, provider);
  const [orders, mappings] = await Promise.all([
    PlatformOrder.find({ ...scoped(req), connectionId: connection._id }).sort({ receivedAt: -1 }).limit(500).select('order.items receivedAt').lean(),
    PlatformItemMapping.find({ ...scoped(req), connectionId: connection._id }).select('externalItemId externalVariantId').lean(),
  ]);
  const mapped = new Set(mappings.map((mapping) => `${mapping.externalItemId}|${mapping.externalVariantId ?? ''}`));
  const seen = new Map();
  for (const order of orders) {
    for (const item of order.order?.items ?? []) {
      const key = `${item.externalItemId}|${item.externalVariantId ?? ''}`;
      if (mapped.has(key)) continue;
      const entry = seen.get(key) ?? { externalItemId: item.externalItemId, externalVariantId: item.externalVariantId ?? null, externalName: item.name, lastSeenAt: order.receivedAt, orderCount: 0 };
      entry.orderCount += 1;
      seen.set(key, entry);
    }
  }
  return [...seen.values()];
}

/**
 * Imports mappings from a CSV: external_item_id,external_variant_id,menu_item,size.
 * Matched by our dish's name and size. A dry run unless `apply`.
 */
export async function importMappings(req, provider, { csv, apply = false }) {
  const connection = await channelConnection(req, provider);
  const rows = parseCsv(csv);
  const [header, ...data] = rows;
  if (!header || header.fields.map((field) => field.toLowerCase()).join(',') !== 'external_item_id,external_variant_id,menu_item,size') {
    throw new BusinessRuleError('The first row must be: external_item_id,external_variant_id,menu_item,size');
  }
  const items = await MenuItem.find({ ...scoped(req), isActive: true }).select('name nameLower variants').lean();
  const planned = [];
  const problems = [];
  for (const { line, fields } of data) {
    const [externalItemId, externalVariantId, menuName, size] = fields;
    const matches = items.filter((item) => item.name.toLowerCase() === String(menuName ?? '').toLowerCase());
    if (!externalItemId) problems.push({ line, message: 'The external item id is missing.' });
    else if (matches.length !== 1) problems.push({ line, message: matches.length ? `"${menuName}" is on the menu more than once.` : `"${menuName}" is not on the menu.` });
    else {
      const variant = size ? matches[0].variants.find((entry) => entry.name.toLowerCase() === size.toLowerCase()) : null;
      if (size && !variant) problems.push({ line, message: `"${menuName}" has no size "${size}".` });
      else planned.push({ externalItemId, externalVariantId: externalVariantId || null, menuItemId: matches[0]._id, variantId: variant?._id ?? null });
    }
  }
  if (apply && problems.length === 0) {
    for (const mapping of planned) {
      await PlatformItemMapping.findOneAndUpdate(
        { ...scoped(req), connectionId: connection._id, externalItemId: mapping.externalItemId, externalVariantId: mapping.externalVariantId },
        { $set: { menuItemId: mapping.menuItemId, variantId: mapping.variantId, lastSeenAt: nowUtc() }, $setOnInsert: { restaurantId: req.restaurantId, branchId: req.branchId, connectionId: connection._id, externalItemId: mapping.externalItemId, externalVariantId: mapping.externalVariantId, addOnMap: {} } },
        { upsert: true },
      );
    }
  }
  return { applied: apply && problems.length === 0, mappings: planned.length, problems };
}

export default { deleteMapping, importMappings, listMappings, saveMapping, unmappedItems };
