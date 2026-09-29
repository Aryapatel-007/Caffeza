/**
 * Converting between a purchase unit and a base unit.
 *
 * Every stock level and every recipe quantity is an integer in the
 * ingredient's own base unit -- G, ML or PIECE -- never a float and never in
 * a purchase unit. Decision D11: this is the factor-of-1000 bug from
 * BUILD-PLAN section 8 (paneer bought in kilograms, used in grams, the two
 * disagreeing and every deduction landing 1000x off) designed out rather
 * than guarded against.
 *
 * A purchase unit -- kg, litre, packet, box -- is an entry and display
 * convenience only, carried on the ingredient as `unitsPerBase`, an integer:
 * how many base units make up one purchase unit. This is the ONLY file in the
 * server that multiplies a purchase quantity by that factor. Nothing else
 * converts, so there is one function to get right and one to test.
 *
 * `unitsPerBase` is not always a power of ten -- a "dozen" purchase unit for
 * PIECE ingredients is 12, not 10 or 1000 -- so this cannot reuse
 * money.js's fixed two-decimal-digit trick. Everything here goes through
 * BigInt, which is exact for any integer ratio and any number of decimal
 * places typed, the same freedom from floating point error money.js gets from
 * parsing the decimal string directly instead of multiplying floats.
 */

function describe(value) {
  if (typeof value === 'string') return `the string "${value}"`;
  if (typeof value === 'number') return `the number ${value}`;
  return `a value of type ${typeof value}`;
}

function assertPositiveInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a whole number of 1 or more, received ${describe(value)}.`);
  }
}

function assertInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be a whole number, received ${describe(value)}.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} is too large to be represented exactly: ${value}.`);
  }
}

/** Parses a decimal amount into its exact sign, whole part, and fraction digits. */
function parseDecimal(input, label) {
  if (typeof input !== 'number' && typeof input !== 'string') {
    throw new TypeError(`${label} expects a number or a string, received ${describe(input)}.`);
  }
  if (typeof input === 'number' && !Number.isFinite(input)) {
    throw new RangeError(`${label} received ${input}, which is not a finite amount.`);
  }

  const text = typeof input === 'number' ? String(input) : input.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new TypeError(
      `${label} could not read ${describe(input)} as a quantity. Expected digits with at most one decimal point, for example "2.5".`,
    );
  }

  const [, sign, wholePart, fractionPart = ''] = match;
  return { sign: sign === '-' ? -1n : 1n, wholePart, fractionPart };
}

/**
 * A purchase-unit quantity, in the base unit, exactly.
 *
 *   purchaseToBaseInteger("2", 1000)      -> 2000   (2 kg of paneer, base G)
 *   purchaseToBaseInteger("0.5", 1000)    -> 500     (half a kg)
 *   purchaseToBaseInteger("1.234", 1000)  -> 1234
 *   purchaseToBaseInteger(2, 1)           -> 2       (already in the base unit)
 *
 * Rounds half away from zero on any precision the base unit cannot represent,
 * the same rounding rule as everywhere else in this project. Every
 * intermediate value is a BigInt, so the multiplication is exact for any
 * `unitsPerBase`, not only a power of ten.
 */
export function purchaseToBaseInteger(purchaseQty, unitsPerBase) {
  assertPositiveInteger(unitsPerBase, 'unitsPerBase');
  const { sign, wholePart, fractionPart } = parseDecimal(purchaseQty, 'purchaseToBaseInteger');

  const scale = 10n ** BigInt(fractionPart.length);
  const scaledQty = BigInt(wholePart) * scale + (fractionPart ? BigInt(fractionPart) : 0n);
  const product = scaledQty * BigInt(unitsPerBase);

  const whole = product / scale;
  const remainder = product % scale;
  const rounded = remainder * 2n >= scale ? whole + 1n : whole;

  const result = Number(sign * rounded);
  assertInteger(result, 'The converted quantity');
  return result;
}

/**
 * The base-unit quantity, as a purchase-unit decimal string, for display only.
 *
 * Never feed this back into arithmetic -- it is a label, the same rule
 * money.js's paiseToRupees carries. `decimalPlaces` defaults to 3, enough to
 * show a gram as a fraction of a kilogram without a long tail of zeros.
 *
 *   baseToPurchaseDisplay(2500, 1000)  ->  "2.5"
 *   baseToPurchaseDisplay(150, 1000)   ->  "0.15"
 *   baseToPurchaseDisplay(7, 1)        ->  "7"
 */
export function baseToPurchaseDisplay(baseQtyInBase, unitsPerBase, { decimalPlaces = 3 } = {}) {
  assertInteger(baseQtyInBase, 'baseToPurchaseDisplay quantity');
  assertPositiveInteger(unitsPerBase, 'unitsPerBase');
  assertPositiveInteger(decimalPlaces + 1, 'decimalPlaces'); // allows 0

  const sign = baseQtyInBase < 0 ? '-' : '';
  const magnitude = BigInt(Math.abs(baseQtyInBase));
  const scale = 10n ** BigInt(decimalPlaces);
  const divisor = BigInt(unitsPerBase);

  const scaledProduct = magnitude * scale;
  const scaledWhole = scaledProduct / divisor;
  const scaledRemainder = scaledProduct % divisor;
  const scaled = scaledRemainder * 2n >= divisor ? scaledWhole + 1n : scaledWhole;

  const whole = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(decimalPlaces, '0').replace(/0+$/, '');

  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Short, lowercase display labels for the three base units. */
export const BASE_UNIT_SHORT_LABELS = Object.freeze({
  G: 'g',
  ML: 'ml',
  PIECE: 'pc',
});

export default { baseToPurchaseDisplay, purchaseToBaseInteger, BASE_UNIT_SHORT_LABELS };
