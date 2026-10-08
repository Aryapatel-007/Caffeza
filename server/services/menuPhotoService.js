/**
 * Dish photos. P24, API-CONTRACT M14 section 5.
 *
 * The only code that writes `menuphotos` or `menuitems.photo`. The file is
 * checked from its own bytes, like the logo: PNG, WebP or JPEG, never SVG.
 */
import { createHash } from 'node:crypto';

import { MenuItem } from '../models/MenuItem.js';
import { MenuPhoto } from '../models/MenuPhoto.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { inspectImage } from '../utils/imageHeader.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { decodeImage } from './brandLogoService.js';

export const PHOTO_MAX_BYTES = 300 * 1024;
export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_MIN_SIDE = 320;

const refuse = (message) => new ValidationError(message, { image: message });
const kilobytes = (bytes) => Math.ceil(bytes / 1024);

export function checkPhotoFile(buffer) {
  const seen = inspectImage(buffer);
  if (!seen.ok && seen.reason === 'SVG') throw refuse('This is an SVG. Upload a PNG, WebP or JPEG photo instead.');
  if (!seen.ok) throw refuse('This file is not a PNG, WebP or JPEG photo.');
  if (buffer.length > PHOTO_MAX_BYTES) {
    throw refuse(`This photo is ${kilobytes(buffer.length)} KB. The largest allowed is ${PHOTO_MAX_BYTES / 1024} KB.`);
  }
  const { width, height } = seen;
  if (Math.max(width, height) > PHOTO_MAX_SIDE) throw refuse(`This photo is larger than ${PHOTO_MAX_SIDE} pixels on a side.`);
  if (Math.min(width, height) < PHOTO_MIN_SIDE) throw refuse(`This photo is smaller than ${PHOTO_MIN_SIDE} pixels on its shorter side.`);
  return {
    contentType: seen.contentType,
    width,
    height,
    sizeBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

async function loadItem(req, itemId) {
  const item = await MenuItem.findOne({ ...scoped(req), _id: itemId });
  if (!item) throw new NotFoundError('Menu item not found.');
  return item;
}

export async function setPhoto(req, itemId, imageText) {
  const item = await loadItem(req, itemId);
  const buffer = decodeImage(imageText);
  const file = checkPhotoFile(buffer);

  await MenuPhoto.updateOne(
    { ...scoped(req), menuItemId: item._id },
    {
      $set: { ...file, data: buffer, setBy: req.user.id, setAt: nowUtc() },
      $setOnInsert: { ...scoped(req), menuItemId: item._id },
    },
    { upsert: true },
  );
  const photo = { sha256: file.sha256, width: file.width, height: file.height };
  await MenuItem.updateOne({ ...scoped(req), _id: item._id }, { $set: { photo } });
  return { ...item.toJSON(), photo };
}

export async function removePhoto(req, itemId) {
  const item = await loadItem(req, itemId);
  await MenuPhoto.deleteOne({ ...scoped(req), menuItemId: item._id });
  await MenuItem.updateOne({ ...scoped(req), _id: item._id }, { $set: { photo: null } });
  return { ...item.toJSON(), photo: null };
}

/** The bytes, or null. Scoped, so one restaurant never serves another's photo. */
export function readPhoto(req, itemId) {
  return MenuPhoto.findOne({ ...scoped(req), menuItemId: itemId }).lean();
}

/** Sends a photo with its hash as the ETag. `cache` is the Cache-Control value. */
export function sendPhoto(req, res, photo, cache) {
  if (!photo) throw new NotFoundError('There is no photo for this dish.');
  const etag = `"${photo.sha256}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', cache);
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.type(photo.contentType);
  const data = Buffer.isBuffer(photo.data) ? photo.data : Buffer.from(photo.data.buffer ?? photo.data);
  return res.status(200).send(data);
}
