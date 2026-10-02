/**
 * Error classes.
 *
 * Anything thrown from a controller, service or middleware should be one of
 * these. The error handler maps them to a status code and the standard failure
 * envelope, and nothing else leaks to the client.
 *
 * The error codes are the fixed strings from docs/CONVENTIONS.md section 3.
 * The frontend switches on the code, never on the message text.
 */

export const ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DUPLICATE: 'DUPLICATE',
  BUSINESS_RULE_VIOLATED: 'BUSINESS_RULE_VIOLATED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Added by M0-B. docs/CONVENTIONS.md section 3 allows a module to add codes
  // in the same shape. Both are 401 and both are deliberately vague, because
  // a precise auth failure message is a free hint to whoever is guessing.
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',

  // Added by M0-C. A 422, because the request is well formed and the rule it
  // breaks is a rule of the business: a restaurant always has one active
  // owner, or nobody can administer it.
  LAST_OWNER: 'LAST_OWNER',

  // Added by M1. The two duplicates are 409 and are deliberately separate from
  // the general DUPLICATE, because the menu screen shows the clash against the
  // field the manager just typed into and needs to know which field that was.
  DUPLICATE_CATEGORY_NAME: 'DUPLICATE_CATEGORY_NAME',
  DUPLICATE_MENU_ITEM_NAME: 'DUPLICATE_MENU_ITEM_NAME',

  // Also M1. Both 404. A variant or add-on id that is not on this item is not
  // found, exactly like an item id that is not in this restaurant.
  VARIANT_NOT_FOUND: 'VARIANT_NOT_FOUND',
  ADDON_NOT_FOUND: 'ADDON_NOT_FOUND',

  // Added by M5. The two clock-state clashes are 409. The three rule breaches
  // are 422: the request is well formed and it is the state or the actor that
  // is wrong. SELF_CORRECTION_FORBIDDEN binds an owner too, which is why it is
  // 422 and not 403 (403 means not you, 422 means not this by anyone).
  ALREADY_CLOCKED_IN: 'ALREADY_CLOCKED_IN',
  NOT_CLOCKED_IN: 'NOT_CLOCKED_IN',
  CLOCK_OUT_BEFORE_CLOCK_IN: 'CLOCK_OUT_BEFORE_CLOCK_IN',
  ENTRY_VOIDED: 'ENTRY_VOIDED',
  SELF_CORRECTION_FORBIDDEN: 'SELF_CORRECTION_FORBIDDEN',

  // Added by M0-D. Raised by the M5 shared-tablet clock through
  // authService.verifyPin. INVALID_PIN is deliberately vague, like
  // INVALID_CREDENTIALS: a wrong PIN and a user with no PIN look the same.
  INVALID_PIN: 'INVALID_PIN',
  PIN_LOCKED: 'PIN_LOCKED',

  /**
   * Added by M3.
   *
   * TRANSACTION_REQUIRED is 503 rather than 500: the request was fine and the
   * server is fine, but this deployment cannot presently offer the guarantee
   * the operation needs. Retrying against a replica set works.
   */
  BILL_ALREADY_EXISTS: 'BILL_ALREADY_EXISTS',
  TRANSACTION_REQUIRED: 'TRANSACTION_REQUIRED',

  // Added by M2. Both 409, and both carry an extra field the client acts on
  // rather than just displays. See the `details` note on AppError.
  TABLE_OCCUPIED: 'TABLE_OCCUPIED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',

  /**
   * Added by M4. All three are 422: each is a well-formed request breaking a
   * business rule, not bad input.
   */
  INGREDIENT_IN_USE: 'INGREDIENT_IN_USE',
  BASE_UNIT_IMMUTABLE: 'BASE_UNIT_IMMUTABLE',
  DUPLICATE_RECIPE_INGREDIENT: 'DUPLICATE_RECIPE_INGREDIENT',

  /**
   * Added by M6. 422 rather than 400: the dates are well formed and the range
   * is a legitimate thing to ask for, it is just more than this endpoint will
   * serve in one request.
   */
  RANGE_TOO_LARGE: 'RANGE_TOO_LARGE',

  /**
   * Added by P02. FEATURE_DISABLED is 403: the request is fine and the caller
   * may be an owner, but this restaurant has switched the module off. The three
   * invoice codes are 422 business rules that protect the unique indexes on
   * `bills`, so a settings change cannot make bill creation fail at the till.
   */
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  INVOICE_START_TOO_LOW: 'INVOICE_START_TOO_LOW',
  INVOICE_SERIES_STARTED: 'INVOICE_SERIES_STARTED',
  INVOICE_SERIES_LOCKED: 'INVOICE_SERIES_LOCKED',

  /** Added by P08. The method is inactive, wrong for the order type, or the wrong platform. */
  PAYMENT_METHOD_NOT_ALLOWED: 'PAYMENT_METHOD_NOT_ALLOWED',

  /** Added by P09. More than an account owes, and two payouts covering one date. */
  ACCOUNT_BALANCE_EXCEEDED: 'ACCOUNT_BALANCE_EXCEEDED',
  PAYOUT_PERIOD_OVERLAP: 'PAYOUT_PERIOD_OVERLAP',

  /** Added by P10. Day Close blocked, and a write into a closed day. */
  DAY_NOT_READY: 'DAY_NOT_READY',
  DAY_CLOSED: 'DAY_CLOSED',

  /** Added by P13, built in P15. The Tally export refuses while an ERROR check fails. */
  CHECK_FAILED: 'CHECK_FAILED',
});

/**
 * Base class for every error we raise on purpose.
 *
 * `isOperational` separates an error we predicted from a genuine crash. The
 * error handler shows an operational message to the client and hides
 * everything else behind a generic 500.
 *
 * `details` is for the handful of errors that carry a value the client acts on
 * rather than displays: the id of the order already open on a table, the
 * version an order actually has. Those are named at the top level of `error` in
 * the contract, beside `code` and `message`, so the error handler merges them
 * in there. Keep it to ids and numbers the client needs to recover. It is not a
 * second `fields`, and it is never somewhere to put internal detail: whatever
 * goes in here is sent to the browser.
 */
export class AppError extends Error {
  constructor(
    message,
    { statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR, fields, details } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    if (fields) this.fields = fields;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'You are not signed in.') {
    super(message, { statusCode: 401, code: ERROR_CODES.UNAUTHENTICATED });
  }
}

/**
 * Deliberately separate from UnauthenticatedError even though both are 401.
 * The client needs to tell "refresh the token" apart from "send the user back
 * to the login screen". Bouncing a cashier to a login form mid-service because
 * a 15 minute access token expired is a bug, not security.
 */
export class TokenExpiredError extends AppError {
  constructor(message = 'Your session has expired.') {
    super(message, { statusCode: 401, code: ERROR_CODES.TOKEN_EXPIRED });
  }
}

/**
 * Login failed. Which of the four reasons it was is never revealed.
 *
 * The phone is unknown, the password is wrong, the user is deactivated, or
 * their restaurant is deactivated: all four produce this exact object, with
 * the same status, code and message. A different message for a deactivated
 * account confirms the account exists.
 *
 * The real reason goes to the server log. See controllers/authController.js.
 */
export class InvalidCredentialsError extends AppError {
  constructor(message = 'Phone number or password is incorrect.') {
    super(message, { statusCode: 401, code: ERROR_CODES.INVALID_CREDENTIALS });
  }
}

/**
 * A refresh token that is unknown, expired, or already revoked.
 *
 * One code for all three, for the same reason as above. An "expired" message
 * would confirm the token was real.
 */
export class InvalidRefreshTokenError extends AppError {
  constructor(message = 'Your session is no longer valid. Please sign in again.') {
    super(message, { statusCode: 401, code: ERROR_CODES.INVALID_REFRESH_TOKEN });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super(message, { statusCode: 403, code: ERROR_CODES.FORBIDDEN });
  }
}

/**
 * Use this when a record does not exist AND when a record exists but belongs
 * to another restaurant.
 *
 * Never return ForbiddenError for a record from another restaurant. A 403
 * confirms the record exists, which tells whoever is probing that they guessed
 * a real id. A 404 tells them nothing. This rule is in
 * docs/CONVENTIONS.md section 3 and is repeated here so it does not get
 * "tidied up" by someone who thinks 403 is more accurate. It is more accurate.
 * It is also a leak.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, { statusCode: 404, code: ERROR_CODES.NOT_FOUND });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Some of the information sent was not valid.', fields) {
    super(message, { statusCode: 400, code: ERROR_CODES.VALIDATION_FAILED, fields });
  }
}

export class DuplicateError extends AppError {
  /**
   * `details` (P06) carries extra top-level fields the client acts on, such as
   * the `existingOrderId` of a platform order entered twice.
   */
  constructor(message = 'That already exists.', fields, details) {
    super(message, { statusCode: 409, code: ERROR_CODES.DUPLICATE, fields, details });
  }
}

/** Input was well formed but breaks a rule of the business. */
export class BusinessRuleError extends AppError {
  constructor(message = 'That is not allowed right now.', code = ERROR_CODES.BUSINESS_RULE_VIOLATED) {
    super(message, { statusCode: 422, code });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many attempts. Please wait and try again.') {
    super(message, { statusCode: 429, code: ERROR_CODES.RATE_LIMITED });
  }
}

/**
 * M1. A category name already used in this branch, compared case-insensitively.
 *
 * Its own class rather than a code argument to DuplicateError, because the four
 * M1 errors below are raised from two controllers and a shared helper, and a
 * class cannot be constructed with the wrong code by accident.
 */
export class DuplicateCategoryNameError extends AppError {
  constructor(message = 'A category with that name already exists.') {
    super(message, {
      statusCode: 409,
      code: ERROR_CODES.DUPLICATE_CATEGORY_NAME,
      fields: { name: 'Already in use.' },
    });
  }
}

/** M1. A menu item name already used in this branch, case-insensitively. */
export class DuplicateMenuItemNameError extends AppError {
  constructor(message = 'A menu item with that name already exists.') {
    super(message, {
      statusCode: 409,
      code: ERROR_CODES.DUPLICATE_MENU_ITEM_NAME,
      fields: { name: 'Already in use.' },
    });
  }
}

/**
 * M1. A variant id that is not on this item.
 *
 * 404 rather than 400, for the same reason a cross-tenant record is 404: the
 * caller named something that, as far as they are concerned, does not exist.
 */
export class VariantNotFoundError extends AppError {
  constructor(message = 'That variant is not on this item.') {
    super(message, { statusCode: 404, code: ERROR_CODES.VARIANT_NOT_FOUND });
  }
}

/** M1. An add-on id that is not on this item. */
export class AddOnNotFoundError extends AppError {
  constructor(message = 'That add-on is not on this item.') {
    super(message, { statusCode: 404, code: ERROR_CODES.ADDON_NOT_FOUND });
  }
}

/**
 * M5. A clock-in for someone who already has an open shift.
 *
 * The partial unique index on `attendanceentries` is the real guarantee; the
 * service checks first only so the caller gets this instead of a raw duplicate
 * key error, and catches the duplicate key as the backstop for the race
 * between two tablets.
 */
export class AlreadyClockedInError extends AppError {
  constructor(message = 'That shift is already open.') {
    super(message, { statusCode: 409, code: ERROR_CODES.ALREADY_CLOCKED_IN });
  }
}

/** M5. A clock-out with no open shift to close. */
export class NotClockedInError extends AppError {
  constructor(message = 'There is no open shift to close.') {
    super(message, { statusCode: 409, code: ERROR_CODES.NOT_CLOCKED_IN });
  }
}

/** M5. A clock-out at or before the clock-in it belongs to. */
export class ClockOutBeforeClockInError extends AppError {
  constructor(message = 'Clock-out cannot be at or before clock-in.') {
    super(message, { statusCode: 422, code: ERROR_CODES.CLOCK_OUT_BEFORE_CLOCK_IN });
  }
}

/** M5. A correction to, or a void of, an entry that is already voided. */
export class EntryVoidedError extends AppError {
  constructor(message = 'That entry is voided and cannot be changed.') {
    super(message, { statusCode: 422, code: ERROR_CODES.ENTRY_VOIDED });
  }
}

/**
 * M2. An order is already open on this table.
 *
 * Raised from the duplicate key error the partial unique index on `orders`
 * produces, never from a check-then-write in a controller. The existing order's
 * id travels with it so the client can open that order instead of showing the
 * second waiter a dead end. That id is not a leak: the caller is inside the
 * restaurant that owns the order, and they are about to be shown the whole
 * thing anyway.
 */
export class TableOccupiedError extends AppError {
  constructor(existingOrderId, message = 'An order is already open on this table.') {
    super(message, {
      statusCode: 409,
      code: ERROR_CODES.TABLE_OCCUPIED,
      details: existingOrderId ? { existingOrderId: String(existingOrderId) } : undefined,
    });
  }
}

/**
 * M5. Correcting, voiding or manually creating your own attendance entry.
 *
 * 422, not 403: it binds everyone including an owner. The audit trail exists to
 * catch someone inflating their own hours, and an actor who can edit their own
 * entry defeats it.
 */
export class SelfCorrectionForbiddenError extends AppError {
  constructor(message = 'You cannot change your own attendance entry. Ask someone else.') {
    super(message, { statusCode: 422, code: ERROR_CODES.SELF_CORRECTION_FORBIDDEN });
  }
}

/**
 * M0-D. A wrong PIN, or a user with no PIN.
 *
 * 401, and deliberately vague: the same object for both cases, so a caller
 * cannot learn whether a PIN is set. Raised by authService.verifyPin, which
 * M5's shared-tablet clock calls.
 */
export class InvalidPinError extends AppError {
  constructor(message = 'That PIN is not correct.') {
    super(message, { statusCode: 401, code: ERROR_CODES.INVALID_PIN });
  }
}

/**
 * M0-D. Too many wrong PINs in a row.
 *
 * 429. The PIN stays locked until an OWNER or MANAGER resets it; it does not
 * clear on its own.
 */
export class PinLockedError extends AppError {
  constructor(message = 'This PIN is locked. Ask a manager to reset it.') {
    super(message, { statusCode: 429, code: ERROR_CODES.PIN_LOCKED });
  }
}

/**
 * M2. The order changed between the client reading it and writing to it.
 *
 * Carries the version the order actually has, so the client can reload and show
 * the waiter what really happened rather than silently overwriting a
 * colleague's work. This is the expected outcome of two people working one
 * table, not an exceptional one.
 */
export class VersionConflictError extends AppError {
  constructor(currentVersion, message = 'This order was changed by someone else. Reloading.') {
    super(message, {
      statusCode: 409,
      code: ERROR_CODES.VERSION_CONFLICT,
      details: { currentVersion },
    });
  }
}

/**
 * M3. A live bill already exists for this order.
 *
 * Raised from the duplicate key error the partial unique index on `bills`
 * produces, never from a check-then-write. The existing bill's id travels with
 * it so the client opens that bill instead of making a second one, the same
 * shape TableOccupiedError uses.
 */
export class BillAlreadyExistsError extends AppError {
  constructor(existingBillId, message = 'This order has already been billed.') {
    super(message, {
      statusCode: 409,
      code: ERROR_CODES.BILL_ALREADY_EXISTS,
      details: existingBillId ? { existingBillId: String(existingBillId) } : undefined,
    });
  }
}

/**
 * M3. This connection cannot start a transaction, so a gap-free bill number
 * cannot be guaranteed.
 *
 * Every other write in this project uses withOptionalTransaction and degrades
 * gracefully on a standalone mongod. Bill creation deliberately does not. A
 * gap-free sequence has no degraded mode: without a transaction the guarantee
 * is simply absent, and silently issuing gappy bill numbers in development is
 * how the pattern reaches production and then an auditor.
 *
 * 503 rather than 500, because the request was fine and retrying against a
 * replica set works.
 */
export class TransactionRequiredError extends AppError {
  constructor(
    message = 'Billing is unavailable on this server configuration. It needs a replica set.',
  ) {
    super(message, { statusCode: 503, code: ERROR_CODES.TRANSACTION_REQUIRED });
  }
}

/**
 * Thrown by the tenant guard when a query reaches the database without a
 * restaurantId filter.
 *
 * This is a 500 because it is our bug, not the caller mistake. It is loud on
 * purpose: a crash is recoverable, a cross-restaurant data leak is not.
 */
export class TenantFilterMissingError extends AppError {
  constructor(modelName, operation) {
    super(
      `Query on ${modelName}.${operation} has no restaurantId filter. Blocked before it reached the database.`,
      { statusCode: 500, code: ERROR_CODES.INTERNAL_ERROR },
    );
    this.modelName = modelName;
    this.operation = operation;
  }
}

/**
 * M4. Deactivating an ingredient a live recipe still consumes.
 *
 * A recipe changes what every future sale deducts, so deactivating an
 * ingredient it references would silently stop deducting for every dish that
 * uses it. The message names how many recipes are affected.
 */
export class IngredientInUseError extends AppError {
  constructor(message = 'This ingredient is still used by an active recipe.') {
    super(message, { statusCode: 422, code: ERROR_CODES.INGREDIENT_IN_USE });
  }
}

/**
 * M4. Changing `baseUnit` after any stockmovements document exists for the
 * ingredient.
 *
 * Changing it would reinterpret every historical quantity in the ledger --
 * 500 g of paneer silently becoming 500 ml -- with no way to detect that
 * afterwards.
 */
export class BaseUnitImmutableError extends AppError {
  constructor(message = "This ingredient's base unit cannot change once stock has moved.") {
    super(message, { statusCode: 422, code: ERROR_CODES.BASE_UNIT_IMMUTABLE });
  }
}

/**
 * M6. A report range wider than the cap.
 *
 * Without a cap, one request scans years of bills and takes the database down
 * during service -- the report screen is opened by an owner, but the database
 * it stalls is the one the floor is taking orders against.
 *
 * 422, not 400: the dates parsed fine and the question is reasonable, it is
 * the size of the answer that is refused. The message names the cap and the
 * range actually asked for, so the caller can narrow it without guessing.
 */
export class RangeTooLargeError extends AppError {
  constructor(days, maxDays) {
    super(
      `That range is ${days} days. Reports cover at most ${maxDays} days in one request.`,
      { statusCode: 422, code: ERROR_CODES.RANGE_TOO_LARGE },
    );
  }
}

/** M4. The same ingredient listed twice in one PUT /recipes body. */
export class DuplicateRecipeIngredientError extends AppError {
  constructor(message = 'The same ingredient cannot appear twice in one recipe.') {
    super(message, { statusCode: 422, code: ERROR_CODES.DUPLICATE_RECIPE_INGREDIENT });
  }
}

/**
 * P02. The route belongs to a module this restaurant has switched off in
 * `settings.features`. Raised by middleware/requireFeature.js.
 */
export class FeatureDisabledError extends AppError {
  constructor(featureLabel) {
    super(
      `${featureLabel} is switched off for this restaurant. An owner can switch it on in Settings.`,
      { statusCode: 403, code: ERROR_CODES.FEATURE_DISABLED },
    );
  }
}

/**
 * P08. A payment method this bill may not use: inactive, not allowed for the
 * order type, or another platform's. The message names which.
 */
export class PaymentMethodNotAllowedError extends AppError {
  constructor(message) {
    super(message, { statusCode: 422, code: ERROR_CODES.PAYMENT_METHOD_NOT_ALLOWED });
  }
}

/** P09. A collection or a downward adjustment larger than the account owes. */
export class AccountBalanceExceededError extends AppError {
  constructor(message) {
    super(message, { statusCode: 422, code: ERROR_CODES.ACCOUNT_BALANCE_EXCEEDED });
  }
}

/** P09. Two live payouts for one method would cover the same business date. */
export class PayoutPeriodOverlapError extends AppError {
  constructor(message) {
    super(message, { statusCode: 409, code: ERROR_CODES.PAYOUT_PERIOD_OVERLAP });
  }
}

/** P10. Day Close is blocked; `details.blockers` lists every reason at once. */
export class DayNotReadyError extends AppError {
  constructor(blockers) {
    super(
      blockers.length === 1
        ? `This day cannot be closed yet: ${blockers[0].message}`
        : `This day cannot be closed yet. ${blockers.length} things need sorting first.`,
      { statusCode: 422, code: ERROR_CODES.DAY_NOT_READY, details: { blockers } },
    );
  }
}

/** P10. A write would change a business date that has been closed. */
export class DayClosedError extends AppError {
  constructor(businessDate) {
    super(`${businessDate} is closed. An owner can reopen it.`, {
      statusCode: 409,
      code: ERROR_CODES.DAY_CLOSED,
      details: { businessDate },
    });
  }
}

/** P15. A report that must not be built while an ERROR check fails, such as R9. */
export class CheckFailedError extends AppError {
  constructor(failed) {
    super(
      `This file is not built while a check fails: ${failed.map((check) => check.message).join(' ')}`,
      { statusCode: 422, code: ERROR_CODES.CHECK_FAILED, details: { checks: failed } },
    );
  }
}


/**
 * Thrown by the append-only guard when code tries to change or remove an
 * audit line. M8.
 *
 * A 500, like the tenant guard: it is our bug, never the caller's. Nothing
 * legitimately updates an audit line. If one is wrong, the truth is that a
 * wrong line was written, and the fix is a new line saying so.
 */
export class AuditLogImmutableError extends AppError {
  constructor(operation) {
    super(`Audit lines are append-only. ${operation} on auditlogs was blocked.`, {
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
    });
    this.operation = operation;
  }
}
