/**
 * Request schemas for online payment and dish photos. P24.
 */
import { z } from 'zod';

import { objectId } from './common.js';
import { SETTINGS_REASON_MAX_LENGTH } from './settingsValidators.js';

const reason = z
  .string({ error: 'A reason is required.' })
  .trim()
  .min(1, 'A reason is required.')
  .max(SETTINGS_REASON_MAX_LENGTH, `Cannot be longer than ${SETTINGS_REASON_MAX_LENGTH} characters.`);

const secret = (label) => z.string({ error: `${label} is required.` }).trim().min(8, `${label} looks too short.`).max(200);

export const getGatewaySchema = z.object({ query: z.object({}).strict() });

export const connectGatewaySchema = z.object({
  body: z
    .object({
      keyId: z.string({ error: 'Key id is required.' }).trim().min(10).max(60),
      keySecret: secret('Key secret'),
      webhookSecret: secret('Webhook secret'),
      reason,
    })
    .strict(),
});

export const disconnectGatewaySchema = z.object({ body: z.object({ reason }).strict() });

export const applyAdvanceSchema = z.object({
  params: z.object({ billId: objectId }).strict(),
  body: z.object({}).strict().optional(),
});

export const retryRefundSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z.object({}).strict().optional(),
});

/** Exactly what Razorpay appends to a payment link's callback. */
export const paymentReturnSchema = z.object({
  params: z.object({ slug: z.string().trim().toLowerCase().min(3).max(40), id: objectId }).strict(),
  body: z
    .object({
      razorpay_payment_id: z.string().trim().min(1).max(60),
      razorpay_payment_link_id: z.string().trim().min(1).max(60),
      razorpay_payment_link_reference_id: z.string().trim().min(1).max(60),
      razorpay_payment_link_status: z.string().trim().min(1).max(30),
      razorpay_signature: z.string().trim().min(1).max(200),
    })
    .strict(),
});

export const itemPhotoParams = z.object({ itemId: objectId }).strict();

export const putPhotoSchema = z.object({
  params: itemPhotoParams,
  body: z.object({ image: z.string({ error: 'Choose a photo to upload.' }).min(1, 'Choose a photo to upload.') }).strict(),
});

export const photoSchema = z.object({ params: itemPhotoParams });

export const publicPhotoSchema = z.object({
  params: z.object({ slug: z.string().trim().toLowerCase().min(3).max(40), itemId: objectId }).strict(),
  query: z.object({ v: z.string().max(64).optional() }).strict(),
});
