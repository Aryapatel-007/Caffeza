/**
 * Payment methods. M10, built in P08. Shapes from docs/API-CONTRACT.md
 * "M10 Payments" section 1. Every rule is in services/paymentMethodService.js.
 */
import { ROLES } from '../config/roles.js';
import {
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from '../services/paymentMethodService.js';
import { ForbiddenError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

/** GET /payment-methods. Inactive ones only for the two roles who manage the till. */
export async function getPaymentMethods(req, res) {
  const { includeInactive } = req.query;
  if (includeInactive && ![ROLES.OWNER, ROLES.MANAGER].includes(req.user.role)) {
    throw new ForbiddenError();
  }
  const methods = await listPaymentMethods(req, { includeInactive });
  return sendSuccess(res, methods.map((method) => method.toJSON()));
}

/** POST /payment-methods */
export async function postPaymentMethod(req, res) {
  const method = await createPaymentMethod(req, req.body);
  return sendSuccess(res, method.toJSON(), 201);
}

/** PATCH /payment-methods/:methodId */
export async function patchPaymentMethod(req, res) {
  const method = await updatePaymentMethod(req, req.params.methodId, req.body);
  return sendSuccess(res, method.toJSON());
}
