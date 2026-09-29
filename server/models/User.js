/**
 * Every person who logs in. Owners, managers and floor staff, one collection.
 *
 * Applies both plugins in full: a user belongs to a restaurant and to a branch.
 */
import mongoose from 'mongoose';

import { ROLE_VALUES } from '../config/roles.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },

  /**
   * The login identity. Exactly ten digits, first digit 6 to 9.
   *
   * Globally unique, across every restaurant on the platform. Login is phone
   * plus password with no restaurant selector, so if two restaurants both had
   * a user with 9876543210 the server could not tell which account to check.
   *
   * The cost is real: someone who works at two of our customer restaurants
   * needs two phone numbers. Uncommon for owners, less so for floor staff
   * working two jobs. The alternative was a restaurant code field on a screen
   * used forty times a day. See docs/DB-SCHEMA.md and the decision log.
   */
  phone: { type: String, required: true, trim: true },

  /**
   * Optional, and a SECOND login identity alongside phone since M0-D.
   *
   * `POST /auth/login` accepts it in place of phone, so it is globally unique
   * when set -- see the partial unique index below. Do not "tidy" that index
   * away on the assumption this is just a contact field: two accounts sharing
   * an email would leave the server unable to tell which one to authenticate,
   * exactly as it would for two accounts sharing a phone.
   *
   * `lowercase: true` is what makes the uniqueness case-insensitive without a
   * collation index, and it is why authService lowercases the login filter.
   */
  email: { type: String, trim: true, lowercase: true, default: null },

  /**
   * bcrypt. Never returned by any endpoint.
   *
   * `select: false` means it is absent from every query result unless a caller
   * explicitly asks with .select('+passwordHash'). Only the auth service does
   * that. Controllers never touch this field.
   */
  passwordHash: { type: String, required: true, select: false },

  /** Never trust an enum from the client. Checked against the frozen list. */
  role: { type: String, required: true, enum: ROLE_VALUES },

  /** There is no delete. Attendance history has to survive staff turnover. */
  isActive: { type: Boolean, required: true, default: true },

  lastLoginAt: { type: Date, default: null },

  /**
   * Closes the window a refresh token cannot.
   *
   * A refresh token can be revoked because it lives in the database. An access
   * token cannot: it is stateless and valid for 15 minutes. The authenticate
   * middleware compares the token `iat` against this field and rejects
   * anything issued before the last password change.
   *
   * Without it, a token stolen at 10:00 keeps working until 10:15 even though
   * the user changed their password at 10:01 because of that exact theft.
   */
  passwordChangedAt: { type: Date, default: null },

  /**
   * A 4 to 6 digit PIN for M5's shared-tablet attendance clock.
   *
   * bcrypt, `select: false`, null until set. Never returned by any endpoint,
   * never logged. Everything that touches it lives in services/authService.js,
   * the same discipline as passwordHash. Verifying a PIN issues no session of
   * any kind — see authService.verifyPin and docs/DB-SCHEMA.md section 3.
   */
  pinHash: { type: String, select: false, default: null },

  /** Consecutive failed PIN checks. Back to 0 on a correct PIN or a reset. */
  pinFailedAttempts: { type: Number, select: false, default: 0 },

  /**
   * Set when the PIN locks after 5 straight failures. Not a timeout: the PIN
   * stays locked until an OWNER or MANAGER sets a new one through
   * PATCH /users/:userId/pin. The date is kept for the audit line and the
   * staff-facing message, not to auto-unlock.
   */
  pinLockedUntil: { type: Date, default: null },
});

userSchema.plugin(baseSchemaPlugin);
userSchema.plugin(tenantGuardPlugin);

/**
 * Deliberately does NOT lead with restaurantId, unlike every other index in
 * this project.
 *
 * Login has no tenant context. The phone number is the only thing the server
 * has, and uniqueness has to hold across the whole platform, not per
 * restaurant. A compound index starting with restaurantId could enforce
 * neither. Do not "fix" this to match the convention.
 */
userSchema.index({ phone: 1 }, { unique: true });

/**
 * Email is a second global login identity, so it is unique too, but only when
 * it is set. The partial filter lets any number of users have no email while
 * two that do have one cannot collide. The model lowercases `email`, so this is
 * case-insensitive without a collation index.
 */
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);

/** Staff lists for one branch. */
userSchema.index({ restaurantId: 1, branchId: 1, isActive: 1 });

/** Permission and reporting queries. */
userSchema.index({ restaurantId: 1, role: 1 });

export const User = mongoose.model('User', userSchema);

export default User;
