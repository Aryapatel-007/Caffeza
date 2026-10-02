/**
 * Kitchen stations. Shapes from docs/API-CONTRACT.md section M18.
 */
import { ROLES } from '../config/roles.js';
import { Station } from '../models/Station.js';
import { categoriesFallingBackTo } from '../services/stationService.js';
import { DuplicateError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';
import { scoped } from '../utils/scopedQuery.js';

const MONGO_DUPLICATE_KEY = 11000;

function rethrowDuplicate(error) {
  if (error?.code === MONGO_DUPLICATE_KEY) {
    throw new DuplicateError('A station with that name already exists.', {
      name: 'Already used by another station.',
    });
  }
  throw error;
}

/** GET /stations. Inactive ones only for the two roles who manage them. */
export async function listStations(req, res) {
  const { includeInactive } = req.query;

  if (includeInactive && ![ROLES.OWNER, ROLES.MANAGER].includes(req.user.role)) {
    throw new ForbiddenError();
  }

  const filter = { ...scoped(req) };
  if (!includeInactive) filter.isActive = true;

  const stations = await Station.find(filter).sort({ displayOrder: 1, createdAt: 1 });
  return sendSuccess(res, stations.map((station) => station.toJSON()));
}

/** POST /stations */
export async function createStation(req, res) {
  const { name, displayOrder, printsTickets, targetMinutes } = req.body;

  const station = new Station({
    ...scoped(req),
    name,
    displayOrder: displayOrder ?? 0,
    printsTickets: printsTickets ?? false,
    ...(targetMinutes !== undefined && { targetMinutes }),
  });
  await station.save().catch(rethrowDuplicate);

  return sendSuccess(res, station.toJSON(), 201);
}

/**
 * PATCH /stations/:stationId
 *
 * Deactivating a station that categories still point at is allowed. They fall
 * back to the default station; the response says how many, so the manager can
 * move them on purpose.
 */
export async function updateStation(req, res) {
  const station = await Station.findOne({ ...scoped(req), _id: req.params.stationId });
  if (!station) throw new NotFoundError('Station not found.');

  for (const field of ['name', 'displayOrder', 'printsTickets', 'targetMinutes', 'isActive']) {
    if (req.body[field] !== undefined) station[field] = req.body[field];
  }
  await station.save().catch(rethrowDuplicate);

  const categoriesFallingBack = station.isActive ? 0 : await categoriesFallingBackTo(req, station._id);

  return res.status(200).json({
    success: true,
    data: station.toJSON(),
    meta: { categoriesFallingBack },
  });
}
