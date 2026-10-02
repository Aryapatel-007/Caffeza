/**
 * The restaurant's logo. P22, docs/API-CONTRACT.md M20 section P22.
 *
 * The only code that reads or writes `restaurants.brandLogos`. Every upload, by
 * the endpoint or by the setup script, goes through `checkLogoFile` and
 * `setLogo`, so every check runs whichever way a logo arrives.
 *
 * `restaurants` is the tenancy root and carries no tenant guard, so every query
 * here is by `_id` taken from a verified token (pattern 1 in models/Restaurant.js).
 */
import { createHash } from 'node:crypto';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { LOGO_SLOTS, Restaurant } from '../models/Restaurant.js';
import { recordAudit } from './auditService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { inspectImage } from '../utils/imageHeader.js';
import { nowUtc } from '../utils/time.js';
import { withOptionalTransaction } from '../utils/transaction.js';

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MAX_SIDE = 1024;
export const LOGO_MIN_SIDE = 128;

const FIELD = 'image';

const refuse = (message) => new ValidationError(message, { [FIELD]: message });

const kilobytes = (bytes) => Math.ceil(bytes / 1024);

/**
 * The upload as bytes. A `data:` prefix is stripped and ignored, never read
 * for the type. Anything that is not clean base64 is refused rather than
 * decoded leniently, because Node's decoder skips characters it does not know.
 */
export function decodeImage(text) {
  if (typeof text !== 'string' || text.trim() === '') throw refuse('Choose an image to upload.');
  const body = text.trim().replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 === 1) {
    throw refuse('This file is not a PNG, WebP or JPEG image.');
  }
  return Buffer.from(body, 'base64');
}

/**
 * Every check from the contract, on the real bytes. Returns what the file is,
 * or throws a 400 on `image` with the reason in plain words.
 */
export function checkLogoFile(buffer) {
  const seen = inspectImage(buffer);
  if (!seen.ok && seen.reason === 'SVG') throw refuse('This is an SVG. Upload a PNG, WebP or JPEG instead.');
  if (!seen.ok) throw refuse('This file is not a PNG, WebP or JPEG image.');

  if (buffer.length > LOGO_MAX_BYTES) {
    throw refuse(`This image is ${kilobytes(buffer.length)} KB. The largest allowed is ${LOGO_MAX_BYTES / 1024} KB.`);
  }
  const { width, height } = seen;
  if (Math.max(width, height) > LOGO_MAX_SIDE) {
    const [side, value] = width >= height ? ['wide', width] : ['tall', height];
    throw refuse(`This image is ${value} pixels ${side}. The largest allowed is ${LOGO_MAX_SIDE}.`);
  }
  if (Math.min(width, height) < LOGO_MIN_SIDE) {
    const [side, value] = width <= height ? ['wide', width] : ['tall', height];
    throw refuse(`This image is ${value} pixels ${side}. The smallest allowed is ${LOGO_MIN_SIDE}.`);
  }
  return {
    contentType: seen.contentType,
    width,
    height,
    sizeBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** One slot as `/auth/me` and the upload response describe it, or null when it is empty. */
function presentSlot(stored) {
  if (!stored?.sha256) return null;
  return { hash: stored.sha256, contentType: stored.contentType, width: stored.width, height: stored.height };
}

/** Both slots, for `/auth/me`. Hashes and sizes only, never bytes. */
export function presentLogos(restaurant) {
  const logos = restaurant?.brandLogos;
  return {
    LIGHT_GROUND: presentSlot(logos?.lightGround),
    DARK_GROUND: presentSlot(logos?.darkGround),
  };
}

const auditDetails = (slot, file) => ({
  slot,
  hash: file.sha256,
  sizeBytes: file.sizeBytes,
  width: file.width,
  height: file.height,
  contentType: file.contentType,
});

/**
 * Stores a logo in a slot and writes BRAND_LOGO_SET, together. The same file
 * as the stored one is not a change, and writes nothing.
 *
 * `context` is `{ restaurantId, branchId, user: { id, role } }`, the shape
 * auditService reads, so the setup script can call this without a request.
 */
export async function setLogo(context, slot, imageText, reason) {
  const key = LOGO_SLOTS[slot];
  const buffer = decodeImage(imageText);
  const file = checkLogoFile(buffer);

  // Legitimate unguarded query pattern 1: by _id from a verified token.
  const current = await Restaurant.findById(context.restaurantId).select(`brandLogos.${key}.sha256`).lean();
  if (!current) throw new NotFoundError('Restaurant not found.');
  const stored = current.brandLogos?.[key];
  if (stored?.sha256 === file.sha256) {
    return { slot, ...presentSlot({ ...stored, ...file }), sizeBytes: file.sizeBytes, setAt: null, changed: false };
  }

  const setAt = nowUtc();
  await withOptionalTransaction(async (session) => {
    await Restaurant.updateOne(
      { _id: context.restaurantId },
      {
        $set: {
          [`brandLogos.${key}`]: {
            contentType: file.contentType,
            data: buffer,
            sha256: file.sha256,
            width: file.width,
            height: file.height,
            sizeBytes: file.sizeBytes,
            setAt,
            setBy: context.user.id,
          },
        },
      },
      session ? { session } : {},
    );
    await recordAudit(
      context,
      {
        action: AUDIT_ACTIONS.BRAND_LOGO_SET,
        entityType: AUDIT_ENTITY_TYPES.SETTINGS,
        entityId: context.restaurantId,
        entityLabel: slot,
        reason,
        details: auditDetails(slot, file),
      },
      session,
    );
  });

  return {
    slot,
    hash: file.sha256,
    contentType: file.contentType,
    width: file.width,
    height: file.height,
    sizeBytes: file.sizeBytes,
    setAt,
    changed: true,
  };
}

/** Empties a slot and writes BRAND_LOGO_REMOVED, together. An empty slot is 404. */
export async function removeLogo(context, slot, reason) {
  const key = LOGO_SLOTS[slot];
  // Legitimate unguarded query pattern 1: by _id from a verified token.
  const current = await Restaurant.findById(context.restaurantId)
    .select(`brandLogos.${key}.sha256 brandLogos.${key}.contentType brandLogos.${key}.width brandLogos.${key}.height brandLogos.${key}.sizeBytes`)
    .lean();
  const stored = current?.brandLogos?.[key];
  if (!stored?.sha256) throw new NotFoundError('There is no logo in that slot.');

  await withOptionalTransaction(async (session) => {
    await Restaurant.updateOne(
      { _id: context.restaurantId },
      { $set: { [`brandLogos.${key}`]: {} } },
      session ? { session } : {},
    );
    await recordAudit(
      context,
      {
        action: AUDIT_ACTIONS.BRAND_LOGO_REMOVED,
        entityType: AUDIT_ENTITY_TYPES.SETTINGS,
        entityId: context.restaurantId,
        entityLabel: slot,
        reason,
        details: auditDetails(slot, stored),
      },
      session,
    );
  });

  return { slot, removed: true };
}

/** The bytes of one slot, for GET /restaurant/logo/:slot, or null when it is empty. */
export async function readLogo(restaurantId, slot) {
  const key = LOGO_SLOTS[slot];
  // Legitimate unguarded query pattern 1: by _id from a verified token.
  const restaurant = await Restaurant.findById(restaurantId).select(`+brandLogos.${key}.data`).lean();
  const stored = restaurant?.brandLogos?.[key];
  if (!stored?.sha256 || !stored.data) return null;
  const data = Buffer.isBuffer(stored.data) ? stored.data : Buffer.from(stored.data.buffer ?? stored.data);
  return { contentType: stored.contentType, sha256: stored.sha256, data };
}

export default { checkLogoFile, decodeImage, presentLogos, readLogo, removeLogo, setLogo };
