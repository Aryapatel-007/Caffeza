/**
 * Kitchen stations, and routing order lines to them. M18, built in P05.
 *
 * Routing is decided here and nowhere else, so the rule in
 * docs/API-CONTRACT.md M18 section 2 has one implementation: a line goes to its
 * category's current station, and anything that cannot be routed goes to the
 * default station, the first active one by displayOrder.
 */
import { Category } from '../models/Category.js';
import { Station } from '../models/Station.js';
import { BusinessRuleError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';

/** The restaurant's active stations, in order. The first is the default station. */
export function activeStations(req, { session = null } = {}) {
  return Station.find({ ...scoped(req), isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .setOptions(session ? { session } : {});
}

/**
 * Throws 422 unless `stationId` is an active station of this restaurant.
 *
 * Another restaurant's station is refused the same way as an inactive one: the
 * scoped query cannot see it, and saying "that station is in another
 * restaurant" would confirm it exists.
 */
export async function assertStationUsable(req, stationId) {
  if (stationId === null || stationId === undefined) return null;
  const station = await Station.findOne({ ...scoped(req), _id: stationId });
  if (!station || !station.isActive) {
    throw new BusinessRuleError('That station is not an active station of this restaurant.');
  }
  return station;
}

/**
 * Groups the lines being fired by the station each goes to.
 *
 * Returns `[{ station, lines }]` in station order, with only stations that have
 * lines. With no active stations it returns one group with `station: null`, so
 * the caller makes exactly one unrouted KOT, as before P05.
 *
 * The category is read now, not frozen: which counter cooks a dish is a
 * question about today. One scoped query for every distinct category.
 */
export async function routeLinesToStations(req, lines, { session = null } = {}) {
  const stations = await activeStations(req, { session });
  if (stations.length === 0) return [{ station: null, lines }];

  const byId = new Map(stations.map((station) => [String(station._id), station]));
  const defaultStation = stations[0];

  const categoryIds = [...new Set(lines.map((line) => line.categoryId).filter(Boolean).map(String))];
  const categories = categoryIds.length
    ? await Category.find({ ...scoped(req), _id: { $in: categoryIds } })
        .select('stationId')
        .setOptions(session ? { session } : {})
    : [];
  const stationOfCategory = new Map(
    categories.map((category) => [String(category._id), category.stationId ? String(category.stationId) : null]),
  );

  const groups = new Map();
  for (const line of lines) {
    const wanted = line.categoryId ? stationOfCategory.get(String(line.categoryId)) : null;
    const station = (wanted && byId.get(wanted)) || defaultStation;
    const key = String(station._id);
    if (!groups.has(key)) groups.set(key, { station, lines: [] });
    groups.get(key).lines.push(line);
  }

  return stations.filter((station) => groups.has(String(station._id))).map((station) => groups.get(String(station._id)));
}

/**
 * How many categories route to the default station because they point at this
 * one while it is inactive. Returned when a station is deactivated, so the
 * manager knows which categories to move.
 */
export function categoriesFallingBackTo(req, stationId) {
  return Category.countDocuments({ ...scoped(req), stationId });
}

export default { activeStations, assertStationUsable, routeLinesToStations, categoriesFallingBackTo };
