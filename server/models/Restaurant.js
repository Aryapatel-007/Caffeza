/**
 * The tenant. One document per customer restaurant.
 *
 * THIS MODEL APPLIES NEITHER baseSchema NOR tenantGuard. That is deliberate
 * and it is the exception documented in docs/DB-SCHEMA.md.
 *
 * A restaurant document does not belong to a restaurant. It IS the restaurant.
 * Its `_id` is the value every other collection stores as `restaurantId`.
 * Applying the guard here would block every legitimate query, because there is
 * no `restaurantId` field to filter on.
 *
 * The cost of that exemption: every query against this collection is
 * unguarded, so every one has to be correct by inspection. There are exactly
 * two legitimate patterns:
 *
 *   1. Lookup by `_id` taken from a verified access token.
 *   2. The provisioning script.
 *
 * Any third pattern is a bug. If you are about to write `Restaurant.find()`
 * with a filter that did not come from a token, stop.
 */
import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
  },
  { _id: false },
);

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/** Whether `menuitems.priceInPaise` is the price before or after GST. */
export const TAX_PRICING_MODES = Object.freeze({
  EXCLUSIVE: 'EXCLUSIVE',
  INCLUSIVE: 'INCLUSIVE',
});
export const TAX_PRICING_MODE_VALUES = Object.freeze(Object.values(TAX_PRICING_MODES));

/**
 * An 80mm thermal roll fits roughly 42 characters per line at normal font. A
 * longer line wraps and destroys the layout, which BUILD-PLAN section 12 names
 * as the printer problem. Caught here, at data entry, rather than in a kitchen
 * during Phase 2.
 */
export const RECEIPT_HEADER_MAX_LENGTH = 40;
export const RECEIPT_FOOTER_MAX_LENGTH = 200;

/**
 * Tax configuration. Shapes from docs/DB-SCHEMA.md section 17.
 *
 * `pricingMode` and `roundOffEnabled` are STORED AND READ BY NOTHING. That is
 * deliberate, not an oversight. M3's tax arithmetic is frozen, tested to the
 * paisa, and carries a documented per-slab rounding rule, and rewiring it from
 * inside a settings module is how billing breaks quietly. Wiring them is its
 * own task with its own tests, and it must not run before a chartered
 * accountant has confirmed which pricing mode the pilot actually uses.
 *
 * `defaultTaxRateBps` is wired: POST /menu-items fills it in when the request
 * omits `taxRateBps`. It changes only the API's default. Every stored item
 * still carries its own rate, so changing this tomorrow moves nothing that
 * already exists.
 */
const taxSettingsSchema = new mongoose.Schema(
  {
    pricingMode: {
      type: String,
      required: true,
      enum: TAX_PRICING_MODE_VALUES,
      default: TAX_PRICING_MODES.EXCLUSIVE,
    },
    defaultTaxRateBps: {
      type: Number,
      required: true,
      default: 500,
      min: 0,
      max: 10_000,
      validate: wholeNumber,
    },
    roundOffEnabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

/**
 * Receipt text and print toggles. Consumed by nothing until Phase 2 thermal
 * printing exists; stored now because these are worth collecting during
 * onboarding rather than on the morning of a pilot.
 */
const receiptSettingsSchema = new mongoose.Schema(
  {
    headerLine1: {
      type: String,
      trim: true,
      maxlength: RECEIPT_HEADER_MAX_LENGTH,
      default: null,
    },
    headerLine2: {
      type: String,
      trim: true,
      maxlength: RECEIPT_HEADER_MAX_LENGTH,
      default: null,
    },
    footerText: {
      type: String,
      trim: true,
      maxlength: RECEIPT_FOOTER_MAX_LENGTH,
      default: null,
    },
    showGstin: { type: Boolean, required: true, default: true },
    showFssai: { type: Boolean, required: true, default: true },
    showServerName: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const inventorySettingsSchema = new mongoose.Schema(
  {
    /**
     * When false the low-stock reads return an empty list and the dashboard
     * returns an empty `lowStock` array. The quantities themselves are
     * untouched: this switches off the surfacing, not the data.
     */
    lowStockAlertsEnabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

/**
 * Which optional modules this restaurant uses. Added by P02.
 *
 * Both default to true so nothing changes for an existing restaurant. Switching
 * one off is enforced on the server by middleware/requireFeature.js, and
 * switching inventory off also stops firing and cancelling from writing stock
 * movements. It never deletes data that already exists.
 */
const featureSettingsSchema = new mongoose.Schema(
  {
    inventory: { type: Boolean, required: true, default: true },
    attendance: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

/** How bill numbers are formed. Added by P02. */
export const INVOICE_MODES = Object.freeze({
  FINANCIAL_YEAR: 'FINANCIAL_YEAR',
  PREFIX: 'PREFIX',
});
export const INVOICE_MODE_VALUES = Object.freeze(Object.values(INVOICE_MODES));

/**
 * GST allows an invoice number of at most 16 characters, using only letters,
 * digits, `-` and `/`. A 7-character prefix plus a 9-digit number is 16, so no
 * number a prefix series issues can break that rule.
 */
export const INVOICE_PREFIX_MAX_LENGTH = 7;
export const INVOICE_PREFIX_PATTERN = /^[A-Za-z0-9/-]{1,7}$/;
export const INVOICE_MAX_STARTING_NUMBER = 999_999_999;

/**
 * The invoice series. `FINANCIAL_YEAR` is M3's original "2026-27/000148".
 * `PREFIX` is a prefix plus a running number that never resets, "CFA/C/22442",
 * so Caffeza can continue the series their old system was issuing.
 *
 * The rules that stop a change here from breaking the unique indexes on
 * `bills` live in settingsService, because they read the database.
 */
const invoiceSettingsSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      required: true,
      enum: INVOICE_MODE_VALUES,
      default: INVOICE_MODES.FINANCIAL_YEAR,
    },
    prefix: {
      type: String,
      trim: true,
      maxlength: INVOICE_PREFIX_MAX_LENGTH,
      default: null,
    },
    startingNumber: {
      type: Number,
      min: 1,
      max: INVOICE_MAX_STARTING_NUMBER,
      default: null,
      validate: {
        validator: (value) => value === null || value === undefined || Number.isInteger(value),
        message: 'Must be a whole number.',
      },
    },
  },
  { _id: false },
);

/**
 * Delivery orders. P06.
 *
 * When true, a DELIVERY order from a listed platform is frozen at 0% GST when
 * it is created, because the platform pays the GST under section 9(5).
 * TO CONFIRM with Caffeza's CA. Only orders created after a change follow it.
 */
const deliverySettingsSchema = new mongoose.Schema(
  {
    platformCollectsGst: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

/**
 * Discounts. P08. When true, a CASHIER may apply a discount with a platform
 * reason (Zomato Gold, Dineout, EazyDiner) and no other. TO CONFIRM with
 * Caffeza.
 */
const discountSettingsSchema = new mongoose.Schema(
  {
    cashierMayApplyPlatformDiscounts: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/**
 * Day Close. P10. The blind count: when false, a MANAGER never sees expected
 * cash or the difference in any Day Close response or print.
 */
const dayCloseSettingsSchema = new mongoose.Schema(
  {
    showCashDifferenceToManager: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/**
 * The floor. P19. The order sections appear in, when a table counts as running
 * long, and whether a dine-in order must say how many guests sit at it.
 */
export const FLOOR_SECTION_ORDER_MAX = 40;
const floorSettingsSchema = new mongoose.Schema(
  {
    sectionOrder: { type: [String], default: [] },
    longOpenMinutes: {
      type: Number,
      required: true,
      default: 90,
      min: 15,
      max: 600,
      validate: { validator: Number.isInteger, message: 'Must be a whole number of minutes.' },
    },
    requireGuestCount: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

/**
 * The look. P20A, docs/DESIGN-SYSTEM.md section 11a. Which accent, the name
 * in the top bar, the second language for fixed action words, and which Today
 * tiles show. A custom accent is checked by `utils/colour.js` in the validator;
 * the model only holds the shape.
 */
export const ACCENT_PRESET_NAMES = Object.freeze(['OCEAN', 'INDIGO', 'PLUM', 'OLIVE', 'ESPRESSO', 'GRAPHITE', 'CUSTOM']);
export const SECOND_LANGUAGES = Object.freeze(['NONE', 'GUJARATI', 'HINDI']);
export const WORDMARK_MAX_LENGTH = 30;
/** P22. Which neutral set every screen uses, DESIGN-SYSTEM section 4a. */
export const NEUTRAL_TONE_VALUES = Object.freeze(['COOL', 'WARM']);

/** R1's tile keys, in contract order. A test keeps this equal to the R1 definition. */
export const TODAY_TILE_KEYS = Object.freeze([
  'billTotalInPaise',
  'netSalesInPaise',
  'billCount',
  'covers',
  'averagePerCoverInPaise',
  'openTables',
  'openItemTotalInPaise',
  'unpaidCount',
  'unpaidInPaise',
  'lastWeekBillTotalInPaise',
]);

const appearanceSettingsSchema = new mongoose.Schema(
  {
    accentPreset: { type: String, enum: ACCENT_PRESET_NAMES, required: true, default: 'OCEAN' },
    accentHex: { type: String, default: null, match: /^#[0-9A-F]{6}$/ },
    wordmark: { type: String, trim: true, default: null, maxlength: WORDMARK_MAX_LENGTH },
    secondLanguage: { type: String, enum: SECOND_LANGUAGES, required: true, default: 'NONE' },
    todayTiles: {
      type: [{ type: String, enum: TODAY_TILE_KEYS }],
      default: () => [...TODAY_TILE_KEYS],
    },
    // P22. The tone, and the logo's own background and the text on it.
    neutralTone: { type: String, enum: NEUTRAL_TONE_VALUES, required: true, default: 'COOL' },
    brandHex: { type: String, default: null, match: /^#[0-9A-F]{6}$/ },
    onBrandHex: { type: String, default: null, match: /^#[0-9A-F]{6}$/ },
  },
  { _id: false },
);

/**
 * Restaurant-level settings. Every field has a default, which is what makes M7
 * a no-migration change: a document written before M7 reads back a complete
 * settings object because Mongoose fills missing paths on read.
 *
 * `services/settingsService.js` is the only place any module reads these from.
 * No controller reaches in here directly, the same discipline as no controller
 * reading the environment and no controller touching `passwordHash`.
 */
const settingsSchema = new mongoose.Schema(
  {
    /**
     * Minutes past midnight IST at which the business day rolls over. 300 is
     * 05:00. A restaurant that closes after midnight counts those sales and
     * shifts under the day the service started. See docs/DB-SCHEMA.md section 1
     * and the decision log, D1. M5 reads this to derive an entry's businessDate.
     *
     * DO NOT MOVE THIS FIELD, and in particular do not nest it under
     * `settings.business` to match the shape of the API response.
     *
     * M3 derives every bill's `businessDate` from it, M5 derives every
     * attendance entry's, and M6 reads it for every report. Nesting it would be
     * tidier and would break three shipped modules at once, on the one field
     * that decides which day a sale belongs to, and would need a migration to
     * do it. Tidiness is not worth that.
     *
     * The API groups it under `business` for readability. That mapping lives in
     * `services/settingsService.js` and nowhere else.
     */
    businessDayStartsAtMinutes: {
      type: Number,
      required: true,
      default: 300,
      min: 0,
      max: 1439,
      validate: { validator: Number.isInteger, message: 'Must be a whole number of minutes.' },
    },

    tax: { type: taxSettingsSchema, default: () => ({}) },
    receipt: { type: receiptSettingsSchema, default: () => ({}) },
    inventory: { type: inventorySettingsSchema, default: () => ({}) },
    features: { type: featureSettingsSchema, default: () => ({}) },
    invoice: { type: invoiceSettingsSchema, default: () => ({}) },
    delivery: { type: deliverySettingsSchema, default: () => ({}) },
    discounts: { type: discountSettingsSchema, default: () => ({}) },
    dayClose: { type: dayCloseSettingsSchema, default: () => ({}) },
    floor: { type: floorSettingsSchema, default: () => ({}) },
    appearance: { type: appearanceSettingsSchema, default: () => ({}) },
  },
  { _id: false },
);

const restaurantSchema = new mongoose.Schema(
  {
    /** Trading name. Shown on screen. */
    name: { type: String, required: true, trim: true },

    /** Registered company name. Appears on a GST invoice. */
    legalName: { type: String, trim: true },

    /** 15 characters. Optional because a small restaurant may not be registered. */
    gstin: { type: String, trim: true, uppercase: true },

    /** 14 digits. */
    fssaiLicenseNumber: { type: String, trim: true },

    address: { type: addressSchema, default: () => ({}) },

    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },

    settings: { type: settingsSchema, default: () => ({}) },

    /**
     * Platform-controlled, not customer-controlled. PATCH /restaurant rejects
     * this field. Deactivating a restaurant is our operation, not theirs.
     */
    isActive: { type: Boolean, required: true, default: true },
  },
  {
    // createdAt and updatedAt as real Date objects, which Mongo stores in UTC.
    timestamps: true,

    /**
     * Written out by hand because baseSchema is not applied here. Without it
     * this collection would answer with `_id` and `__v`, and every M0 response
     * shape in docs/API-CONTRACT.md says `id`.
     */
    toJSON: {
      versionKey: false,
      transform(_document, record) {
        record.id = record._id?.toString();
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  },
);

/**
 * No compound index. docs/DB-SCHEMA.md is explicit that `_id` is enough: this
 * collection holds tens of documents, not millions. An index added "just in
 * case" here costs writes and buys nothing.
 */

export const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
