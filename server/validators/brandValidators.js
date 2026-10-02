/**
 * The logo endpoints. P22, docs/API-CONTRACT.md M20 section P22.
 *
 * Only the shape is checked here. Whether `image` is really a PNG, WebP or
 * JPEG of an allowed size is read from its bytes by brandLogoService, because
 * it cannot be known from the request's shape.
 */
import { z } from 'zod';

import { LOGO_SLOT_NAMES } from '../models/Restaurant.js';
import { SETTINGS_REASON_MAX_LENGTH } from './settingsValidators.js';

const slotParams = z.object({
  slot: z.enum(LOGO_SLOT_NAMES, { error: `Must be one of ${LOGO_SLOT_NAMES.join(', ')}.` }),
});

const reason = z
  .string({ error: 'A reason is required.' })
  .trim()
  .min(1, 'A reason is required.')
  .max(SETTINGS_REASON_MAX_LENGTH, `Cannot be longer than ${SETTINGS_REASON_MAX_LENGTH} characters.`);

export const putLogoSchema = z.object({
  params: slotParams,
  body: z
    .object({
      reason,
      image: z.string({ error: 'Choose an image to upload.' }).min(1, 'Choose an image to upload.'),
    })
    .strict(),
});

export const deleteLogoSchema = z.object({
  params: slotParams,
  body: z.object({ reason }).strict(),
});

export const getLogoSchema = z.object({ params: slotParams });
