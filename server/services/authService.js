/**
 * Credential checking.
 *
 * This file and passwordService.js are the only two that ever name the stored
 * hash. Controllers ask questions here and get answers, and the field itself
 * never leaves this layer. That separation is enforceable by grep:
 *
 *   grep -rn "passwordHash" server/controllers/
 *
 * should return nothing, forever.
 */
import { User } from '../models/User.js';
import { InvalidPinError, PinLockedError } from '../utils/errors.js';
import { compare, DUMMY_HASH, hash } from './passwordService.js';
import { nowUtc } from '../utils/time.js';

/** Why a login attempt failed. For the server log only, never for the client. */
export const LOGIN_FAILURE = Object.freeze({
  IDENTITY_NOT_FOUND: 'IDENTITY_NOT_FOUND',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  USER_INACTIVE: 'USER_INACTIVE',
});

/** The field is `select: false`, so reading it takes an explicit opt-in. */
const WITH_SECRET = '+passwordHash';

/** The PIN fields are `select: false` too. */
const WITH_PIN = '+pinHash +pinFailedAttempts';

/** Five wrong PINs in a row locks it until a manager resets it. */
const MAX_PIN_ATTEMPTS = 5;

/** How far out `pinLockedUntil` is stamped. It does not auto-unlock. */
const PIN_LOCK_MS = 15 * 60 * 1000;

/**
 * Looks a user up by phone OR email and checks the password.
 *
 * The caller passes exactly one of the two (the login schema enforces that).
 * Returns `{ user }` on success, or `{ failure }` naming which of the three
 * things went wrong. The caller turns any of them into the same 401.
 *
 * Both paths cost the same amount of time. When the identifier is not found the
 * comparison still runs, against a dummy hash, because returning early would let
 * an attacker time the response and learn which phones or emails exist.
 */
export async function verifyCredentials({ phone, email }, password) {
  /**
   * Login has no tenant context. The identifier is the only thing the server
   * has, which is why docs/DB-SCHEMA.md makes both phone and email globally
   * unique with their own indexes that do not lead with restaurantId.
   *
   * This is one of the escape-hatch lookups: it genuinely runs before any
   * tenant is known.
   */
  const filter = email ? { email: email.toLowerCase() } : { phone };
  const user = await User.findOne(filter)
    .select(WITH_SECRET)
    .setOptions({ skipTenantGuard: true });

  // P25 Part G. The integration user cannot sign in, and is told nothing that says it exists.
  if (!user || user.isSystem) {
    await compare(password, DUMMY_HASH);
    return { failure: LOGIN_FAILURE.IDENTITY_NOT_FOUND };
  }

  const matches = await compare(password, user.get(WITH_SECRET.slice(1)));
  if (!matches) return { failure: LOGIN_FAILURE.WRONG_PASSWORD, user };

  if (user.isActive === false) return { failure: LOGIN_FAILURE.USER_INACTIVE, user };

  return { user };
}

/**
 * Is this phone number registered anywhere on the platform?
 *
 * Phone numbers are globally unique, so this question cannot be answered
 * within one restaurant. Both callers that need it, creating a staff user and
 * provisioning a new restaurant, come through here rather than writing their
 * own unguarded query.
 *
 * The caller is told yes or no and nothing else. Which restaurant holds the
 * number is not returned, because saying so would leak the customer list of
 * one restaurant to another.
 */
export async function isPhoneRegistered(phone, { session = null } = {}) {
  // Genuinely tenant-less: uniqueness spans the whole platform, which is why
  // docs/DB-SCHEMA.md gives phone its own unique index that does not lead with
  // restaurantId. An escape-hatch lookup, like the login and refresh reads.
  const query = User.findOne({ phone }).select('_id').setOptions({ skipTenantGuard: true });
  if (session) query.session(session);

  return (await query) !== null;
}

/**
 * Is this email registered anywhere on the platform?
 *
 * Same shape and same reasoning as `isPhoneRegistered`: email is a global login
 * identity now, so the question cannot be scoped to one restaurant. The caller
 * gets yes or no, never which restaurant holds it.
 */
export async function isEmailRegistered(rawEmail, { session = null } = {}) {
  const value = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (value.length === 0) return false;

  const query = User.findOne({ email: value }).select('_id').setOptions({ skipTenantGuard: true });
  if (session) query.session(session);

  return (await query) !== null;
}

/**
 * Creates a user with a password.
 *
 * Lives here rather than in the controller because it is the moment the stored
 * credential is set, and that field is not named outside this layer.
 *
 * passwordChangedAt is null, not the current time. The field exists to
 * invalidate access tokens issued BEFORE a password change, and a user who has
 * never signed in has none. Stamping it would be worse than pointless: the
 * authenticate middleware compares whole seconds and fails closed, so a token
 * minted in the same second as the stamp is rejected, and the first login of a
 * newly created user would fail whenever the two landed together.
 */
export async function createUserWithPassword(fields, plainPassword) {
  return User.create({
    ...fields,
    [WITH_SECRET.slice(1)]: await hash(plainPassword),
    isActive: true,
    lastLoginAt: null,
    passwordChangedAt: null,
  });
}

/** Checks the password of a user who is already signed in. */
export async function verifyPasswordFor({ userId, restaurantId }, password) {
  const user = await User.findOne({ _id: userId, restaurantId }).select(WITH_SECRET);
  if (!user) return { matches: false };

  const matches = await compare(password, user.get(WITH_SECRET.slice(1)));
  return { matches, user };
}

/**
 * Replaces a password.
 *
 * `passwordChangedAt` is stamped in the same save, because the authenticate
 * middleware reads it to reject access tokens minted before this moment.
 * Setting one without the other leaves the old 15 minute token working.
 */
export async function setPassword(user, newPassword) {
  user.set(WITH_SECRET.slice(1), await hash(newPassword));
  user.passwordChangedAt = nowUtc();
  await user.save();
  return user;
}

/**
 * Sets or replaces a user's PIN, and clears any lock and failure count.
 *
 * The caller checks permission first. This is the only place `pinHash` is
 * written, so `grep -rn "pinHash" server/controllers/` stays empty.
 */
export async function setPin(user, plainPin) {
  user.set('pinHash', await hash(plainPin));
  user.set('pinFailedAttempts', 0);
  user.pinLockedUntil = null;
  await user.save();
  return user;
}

/**
 * Verifies a PIN for one known user, within one restaurant and branch.
 *
 * Returns `{ userId }` on success. Throws InvalidPinError or PinLockedError on
 * failure. It NEVER issues a token, access or refresh, or anything else that
 * outlives the request. That is the whole point: on a tablet forty people
 * touch, the worst a leaked PIN can do is record a clock event for the wrong
 * person, which a manager corrects with an audit line.
 *
 * A missing user, a user with no PIN, and a wrong PIN all cost one bcrypt
 * comparison against the dummy hash and raise the same InvalidPinError, so
 * timing and the response cannot reveal which users exist or which have a PIN.
 *
 * The only caller is M5's `POST /api/v1/attendance/station/clock`.
 */
export async function verifyPin({ restaurantId, branchId, userId }, pin) {
  const candidate = typeof pin === 'string' ? pin : '';

  const user = await User.findOne({ _id: userId, restaurantId, branchId }).select(WITH_PIN);

  if (!user || !user.get('pinHash')) {
    await compare(candidate, DUMMY_HASH);
    throw new InvalidPinError();
  }

  if (user.pinLockedUntil) {
    await compare(candidate, DUMMY_HASH);
    throw new PinLockedError();
  }

  const matches = await compare(candidate, user.get('pinHash'));

  if (!matches) {
    const attempts = (user.get('pinFailedAttempts') ?? 0) + 1;
    user.set('pinFailedAttempts', attempts);

    if (attempts >= MAX_PIN_ATTEMPTS) {
      user.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MS);
      await user.save();
      throw new PinLockedError();
    }

    await user.save();
    throw new InvalidPinError();
  }

  if ((user.get('pinFailedAttempts') ?? 0) !== 0) {
    user.set('pinFailedAttempts', 0);
    await user.save();
  }

  return { userId: String(user._id) };
}
