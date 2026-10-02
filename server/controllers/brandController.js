/**
 * The restaurant's logo. P22, docs/API-CONTRACT.md M20 section P22.
 *
 * No restaurant id in any path: the restaurant is the one in the token, so a
 * logo of another restaurant cannot even be asked for, and is a 404.
 */
import { readLogo, removeLogo, setLogo } from '../services/brandLogoService.js';
import { NotFoundError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

/** The tenant, the actor and the actor's role at the time: what the audit line records. */
const contextOf = (req) => ({
  restaurantId: req.restaurantId,
  branchId: req.branchId,
  user: { id: req.user.id, role: req.user.role },
});

/** PUT /settings/appearance/logo/:slot. OWNER only. */
export async function putLogo(req, res) {
  const { changed, ...slot } = await setLogo(contextOf(req), req.params.slot, req.body.image, req.body.reason);
  req.log?.info({ actorId: req.user.id, slot: slot.slot, changed }, 'Restaurant logo set.');
  return sendSuccess(res, slot);
}

/** DELETE /settings/appearance/logo/:slot. OWNER only. */
export async function deleteLogo(req, res) {
  const result = await removeLogo(contextOf(req), req.params.slot, req.body.reason);
  req.log?.info({ actorId: req.user.id, slot: result.slot }, 'Restaurant logo removed.');
  return sendSuccess(res, result);
}

/** GET /restaurant/logo/:slot. Every role, the caller's own restaurant only. */
export async function getLogo(req, res) {
  const logo = await readLogo(req.restaurantId, req.params.slot);
  if (!logo) throw new NotFoundError('There is no logo in that slot.');

  const etag = `"${logo.sha256}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  if (req.get('If-None-Match') === etag) return res.status(304).end();

  res.type(logo.contentType);
  return res.status(200).send(logo.data);
}
