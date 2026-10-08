/** Customers. P27, API-CONTRACT M22. */
import { z } from 'zod';

import { CUSTOMER_NAME_MAX_LENGTH } from '../models/Order.js';
import { objectId, paginationQuery } from './common.js';

const customerIdParam = z.object({ customerId: objectId });

export const listCustomersSchema = z.object({
  query: paginationQuery.extend({ offers: z.enum(['true', 'false']).optional() }).strict('Is not a filter here.'),
});

export const searchCustomersSchema = z.object({
  body: z
    .object({
      query: z.string({ error: 'Type a name or a number.' }).trim().min(2, 'Type at least 2 characters.').max(40),
      offers: z.boolean().optional(),
    })
    .strict('Is not a field you can set here.'),
});

export const readCustomerSchema = z.object({ params: customerIdParam });

export const updateCustomerSchema = z.object({
  params: customerIdParam,
  body: z
    .object({
      name: z.string().trim().min(1, 'Is required.').max(CUSTOMER_NAME_MAX_LENGTH).optional(),
      offersConsent: z.boolean({ error: 'Must be true or false.' }).optional(),
      reason: z.string().trim().min(1).max(200).optional(),
    })
    .strict('Is not a field you can set here.')
    .refine((body) => body.name !== undefined || body.offersConsent !== undefined, 'Send a change.'),
});

export const exportCustomersSchema = z.object({ query: z.object({}).strict() });
