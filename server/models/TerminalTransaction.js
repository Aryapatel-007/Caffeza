/**
 * One attempt to take a payment on a card machine. P25 Part I,
 * docs/DB-SCHEMA.md section 37.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

export const TERMINAL_STATUSES = Object.freeze({
  CREATED: 'CREATED',
  WAITING: 'WAITING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  UNKNOWN: 'UNKNOWN',
});

const terminalTransactionSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection', required: true },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
  billNumber: { type: String, required: true },
  methodCode: { type: String, required: true },
  allowedPaymentMode: { type: Number, required: true },
  amountInPaise: { type: Number, required: true, min: 1 },
  transactionNumber: { type: String, required: true, match: /^[A-Za-z0-9]{1,50}$/ },
  sequenceNumber: { type: Number, required: true, min: 1 },
  terminal: {
    type: new mongoose.Schema({ name: { type: String, required: true }, clientId: { type: String, required: true } }, { _id: false }),
    required: true,
  },
  ptrid: { type: String, default: null },
  status: { type: String, required: true, enum: Object.values(TERMINAL_STATUSES), default: TERMINAL_STATUSES.CREATED },
  // What the machine said. `maskedCard` only as the machine sends it; never a full card number.
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  paymentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastMessage: { type: String, trim: true, maxlength: 300, default: null },
  businessDate: { type: String, required: true },
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  lastCheckedAt: { type: Date, default: null },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

terminalTransactionSchema.plugin(baseSchemaPlugin);
terminalTransactionSchema.plugin(tenantGuardPlugin);

terminalTransactionSchema.index({ restaurantId: 1, connectionId: 1, transactionNumber: 1, sequenceNumber: 1 }, { unique: true });
terminalTransactionSchema.index({ restaurantId: 1, ptrid: 1 }, { unique: true, partialFilterExpression: { ptrid: { $type: 'string' } } });
/** One approval is never two payments. */
terminalTransactionSchema.index({ restaurantId: 1, paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'objectId' } } });
/** The checking job, and Day Close blockers. */
terminalTransactionSchema.index({ restaurantId: 1, status: 1, startedAt: 1 });

applyJsonTransform(terminalTransactionSchema);

export const TerminalTransaction = mongoose.model('TerminalTransaction', terminalTransactionSchema);
