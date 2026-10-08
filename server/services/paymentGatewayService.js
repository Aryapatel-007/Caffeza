/**
 * The cafe's own Razorpay account: connecting, disconnecting, and the keys.
 * P24, API-CONTRACT M14 section 4.1.
 *
 * The only code that opens the stored secrets. They are sealed with
 * utils/secretBox.js under PAYMENT_SECRETS_KEY, are `select: false` on the
 * restaurant, and never appear in a response, a log line or an audit line.
 */
import { config } from '../config/env.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../models/AuditLog.js';
import { Branch } from '../models/Branch.js';
import { PaymentMethod, PAYMENT_METHOD_KINDS } from '../models/PaymentMethod.js';
import { ORDER_TYPES } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { PaymentGatewayNotConnectedError, ValidationError } from '../utils/errors.js';
import { canStoreSecrets, openSecret, sealSecret } from '../utils/secretBox.js';
import { nowUtc } from '../utils/time.js';
import { recordAudit } from './auditService.js';
import { checkKeys } from './razorpayClient.js';

const DUPLICATE_KEY = 11000;

/** The payment method an advance becomes on a bill. Used only by apply-advance. */
export const ONLINE_METHOD_CODE = 'ONLINE';

const modeOf = (keyId) => (keyId.startsWith('rzp_live_') ? 'LIVE' : 'TEST');

/** Creates "Paid online" when missing. Never overwrites an existing method. */
export async function ensureOnlineMethod(restaurantId, branchId) {
  try {
    await PaymentMethod.updateOne(
      { restaurantId, code: ONLINE_METHOD_CODE },
      {
        $setOnInsert: {
          restaurantId,
          branchId,
          code: ONLINE_METHOD_CODE,
          name: 'Paid online',
          kind: PAYMENT_METHOD_KINDS.IN_HAND,
          orderTypes: Object.values(ORDER_TYPES),
          platformCode: null,
          tallyLedgerCode: null,
          commissionBps: null,
          displayOrder: 90,
          isActive: true,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
  }
}

/** The address the owner pastes into Razorpay's dashboard for webhooks. */
async function webhookUrlFor(req) {
  const branch = await Branch.findOne({ _id: req.branchId, restaurantId: req.restaurantId }).select('online');
  const slug = branch?.online?.publicSlug;
  return slug ? `${config.CLIENT_ORIGIN}/api/v1/public/${slug}/payments/webhook` : null;
}

/** GET /settings/payments/gateway. Never a secret. */
export async function gatewayStatus(req) {
  const restaurant = await Restaurant.findById(req.restaurantId).select('paymentGateway');
  const gateway = restaurant?.paymentGateway;
  return {
    connected: Boolean(gateway),
    provider: gateway ? gateway.provider : null,
    keyId: gateway?.keyId ?? null,
    mode: gateway?.mode ?? null,
    connectedAt: gateway?.connectedAt ?? null,
    webhookUrl: await webhookUrlFor(req),
    serverReady: canStoreSecrets(),
  };
}

/** PUT /settings/payments/gateway. Checks the keys with Razorpay first. */
export async function connectGateway(req, { keyId, keySecret, webhookSecret, reason }) {
  if (!canStoreSecrets()) {
    throw new PaymentGatewayNotConnectedError('Online payment is not set up on this server. Ask the developer to set PAYMENT_SECRETS_KEY.');
  }
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    throw new ValidationError('That does not look like a Razorpay key id.', { keyId: 'Starts with rzp_test_ or rzp_live_.' });
  }

  await checkKeys({ keyId, keySecret });

  const mode = modeOf(keyId);
  await Restaurant.updateOne(
    { _id: req.restaurantId },
    {
      $set: {
        paymentGateway: {
          provider: 'RAZORPAY',
          keyId,
          keySecretEncrypted: sealSecret(keySecret),
          webhookSecretEncrypted: sealSecret(webhookSecret),
          mode,
          connectedAt: nowUtc(),
          connectedBy: req.user.id,
        },
      },
    },
  );
  await ensureOnlineMethod(req.restaurantId, req.branchId);

  await recordAudit(req, {
    action: AUDIT_ACTIONS.PAYMENT_GATEWAY_CONNECTED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: req.restaurantId,
    entityLabel: 'Razorpay',
    reason,
    details: { keyId, mode },
  });
  return gatewayStatus(req);
}

/** DELETE /settings/payments/gateway. Payments already taken keep their refunds working. */
export async function disconnectGateway(req, { reason }) {
  const restaurant = await Restaurant.findById(req.restaurantId).select('paymentGateway');
  const gateway = restaurant?.paymentGateway;
  if (!gateway) return gatewayStatus(req);

  await Restaurant.updateOne({ _id: req.restaurantId }, { $set: { paymentGateway: null } });
  await recordAudit(req, {
    action: AUDIT_ACTIONS.PAYMENT_GATEWAY_DISCONNECTED,
    entityType: AUDIT_ENTITY_TYPES.SETTINGS,
    entityId: req.restaurantId,
    entityLabel: 'Razorpay',
    reason,
    details: { keyId: gateway.keyId, mode: gateway.mode },
  });
  return gatewayStatus(req);
}

/**
 * The opened keys, or null when no gateway is connected or this server
 * cannot open them. Kept in memory for the length of one request only.
 */
export async function keysFor(restaurantId) {
  if (!canStoreSecrets()) return null;
  // `+` alone: the whole document plus the two sealed fields. Naming the parent too is a path collision.
  const restaurant = await Restaurant.findById(restaurantId).select(
    '+paymentGateway.keySecretEncrypted +paymentGateway.webhookSecretEncrypted',
  );
  const gateway = restaurant?.paymentGateway;
  if (!gateway) return null;
  return {
    keyId: gateway.keyId,
    keySecret: openSecret(gateway.keySecretEncrypted),
    webhookSecret: openSecret(gateway.webhookSecretEncrypted),
  };
}

/** Whether new payments can be taken right now. */
export async function canTakePayments(restaurantId) {
  if (!canStoreSecrets()) return false;
  const restaurant = await Restaurant.findById(restaurantId).select('paymentGateway.keyId');
  return Boolean(restaurant?.paymentGateway?.keyId);
}
