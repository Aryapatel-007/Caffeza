/**
 * One table on the floor. T1, A4, Terrace 2.
 *
 * An ordinary tenant collection. Not a tenancy root, so both plugins apply in
 * full and every query against it carries a restaurantId.
 *
 * The thing this schema deliberately does not have is an occupancy flag. See
 * the note at the bottom.
 */
import mongoose from 'mongoose';

import { applyJsonTransform } from './plugins/jsonTransform.js';
import { baseSchemaPlugin } from './plugins/baseSchema.js';
import { tenantGuardPlugin } from './plugins/tenantGuard.js';
import { liveAnnouncePlugin } from './plugins/liveAnnounce.js';

export const TABLE_NAME_MAX_LENGTH = 20;
export const TABLE_SECTION_MAX_LENGTH = 40;
export const MIN_SEATS = 1;
export const MAX_SEATS = 50;

/** P19. Each section's floor plan is a grid of this many columns and rows. */
export const FLOOR_COLUMNS = 24;
export const FLOOR_ROWS = 16;
export const MAX_TABLE_SPAN = 4;
export const TABLE_SHAPES = Object.freeze(['SQUARE', 'ROUND', 'LONG']);

const wholeNumber = {
  validator: Number.isInteger,
  message: 'Must be a whole number.',
};

/**
 * The same check for a field that is allowed to be absent.
 *
 * Mongoose skips its own min and max on a null, but it still runs a custom
 * validator, and Number.isInteger(null) is false. Without this, a table created
 * without a seat count fails validation on the default value the schema itself
 * just supplied.
 */
const wholeNumberOrEmpty = {
  validator: (value) => value === null || value === undefined || Number.isInteger(value),
  message: 'Must be a whole number.',
};

const tableSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: TABLE_NAME_MAX_LENGTH,
  },

  /**
   * Derived from `name`, maintained here and never by a caller. Stripped in
   * toJSON.
   *
   * Category and MenuItem both do this for the same reason: case-insensitive
   * uniqueness in Mongo otherwise needs a collation-aware index, and a query
   * written without the matching collation silently misses it and answers
   * case-sensitively. A lowercase field makes the uniqueness ordinary and
   * visible in the index definition below. Part 5 of the plan says collation
   * for this collection; the two M1 collections say collation too and shipped
   * with this instead, and three collections doing the same thing beats one
   * doing it differently. Logged in PROJECT-STATE.md.
   */
  nameLower: { type: String, required: true },

  section: {
    type: String,
    trim: true,
    maxlength: TABLE_SECTION_MAX_LENGTH,
    default: null,
  },

  seats: {
    type: Number,
    min: MIN_SEATS,
    max: MAX_SEATS,
    validate: wholeNumberOrEmpty,
    default: null,
  },

  displayOrder: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: wholeNumber,
  },

  /** The delete. There is no DELETE route on this collection either. */
  isActive: { type: Boolean, required: true, default: true },

  /**
   * P19. Where the table sits on its section's floor plan, in whole grid cells,
   * or null when it has no place yet. Bounds and overlaps are checked by
   * PATCH /tables/layout, which saves a section at once; the schema holds the
   * bounds again so no other path can store a table off the grid.
   */
  layout: {
    type: new mongoose.Schema(
      {
        x: { type: Number, required: true, min: 0, max: FLOOR_COLUMNS - 1, validate: wholeNumber },
        y: { type: Number, required: true, min: 0, max: FLOOR_ROWS - 1, validate: wholeNumber },
        w: { type: Number, required: true, min: 1, max: MAX_TABLE_SPAN, validate: wholeNumber },
        h: { type: Number, required: true, min: 1, max: MAX_TABLE_SPAN, validate: wholeNumber },
        shape: { type: String, required: true, enum: TABLE_SHAPES },
      },
      { _id: false },
    ),
    default: null,
  },
});

tableSchema.plugin(baseSchemaPlugin);
tableSchema.plugin(tenantGuardPlugin);
// P33. Tells open screens that read these topics to read again, after the write commits.
tableSchema.plugin(liveAnnouncePlugin, { topics: ['tables'] });

tableSchema.pre('validate', function deriveNameLower() {
  if (typeof this.name === 'string') this.nameLower = this.name.trim().toLowerCase();
});

/**
 * Two tables in one restaurant cannot share a name, case-insensitively.
 *
 * Per restaurant rather than per branch, which is what Part 5 specifies. A
 * table name is what a waiter shouts across a room, and two "T1"s in one
 * building is a mistake worth blocking even if they are nominally in different
 * branches.
 */
tableSchema.index({ restaurantId: 1, nameLower: 1 }, { unique: true });

/** The floor view's read: active tables, in display order. */
tableSchema.index({ restaurantId: 1, branchId: 1, isActive: 1, displayOrder: 1 });

applyJsonTransform(tableSchema, { strip: ['nameLower'] });

export const Table = mongoose.model('Table', tableSchema);

export default Table;

/* ------------------------------------------------------------------------- *
 * THERE IS NO OCCUPANCY FIELD, AND THERE MUST NOT BE ONE
 *
 * Whether a table is occupied is derived from whether an order is open on it,
 * computed at request time in controllers/tableController.js.
 *
 * A stored flag drifts. A process dies between closing an order and clearing
 * the flag, and now a table is permanently occupied with no order on it, and
 * the only fix is someone editing the database on a Saturday night. The open
 * order is the fact. The flag would only ever be a cache of it.
 * ------------------------------------------------------------------------- */
