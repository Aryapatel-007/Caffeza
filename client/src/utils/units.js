/**
 * Converting between a purchase unit and a base unit, client side.
 *
 * The mirror of `server/utils/units.js`, the same relationship
 * `formatMoney.js` has with `server/utils/money.js`: the same algorithm on
 * both sides so the two can never disagree. `qtyInBase` sent to the API is
 * always computed by this file; nothing else in the client converts.
 *
 * Uses BigInt for the same reason the server does: `unitsPerBase` is not
 * always a power of ten (a "dozen" purchase unit is 12), so a plain float
 * multiplication is not exact.
 */

function parseDecimal(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const text = typeof input === 'number' ? String(input) : input.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const [, sign, wholePart, fractionPart = ''] = match;
  return { sign: sign === '-' ? -1n : 1n, wholePart, fractionPart };
}

/**
 * A purchase-unit quantity (typed by a storekeeper, e.g. "2.5" kg) to the
 * exact integer in the base unit. Returns null for anything that is not a
 * plain decimal, so a caller shows a field error instead of sending NaN.
 *
 *   purchaseToBaseInteger('2', 1000)   -> 2000
 *   purchaseToBaseInteger('0.5', 1000) -> 500
 */
export function purchaseToBaseInteger(purchaseQty, unitsPerBase) {
  if (!Number.isInteger(unitsPerBase) || unitsPerBase < 1) return null;
  const parsed = parseDecimal(purchaseQty);
  if (!parsed) return null;

  const { sign, wholePart, fractionPart } = parsed;
  const scale = 10n ** BigInt(fractionPart.length);
  const scaledQty = BigInt(wholePart) * scale + (fractionPart ? BigInt(fractionPart) : 0n);
  const product = scaledQty * BigInt(unitsPerBase);

  const whole = product / scale;
  const remainder = product % scale;
  const rounded = remainder * 2n >= scale ? whole + 1n : whole;

  const result = Number(sign * rounded);
  return Number.isSafeInteger(result) ? result : null;
}

/**
 * The base-unit quantity as a purchase-unit decimal string, for the live
 * "= 2000 g" working shown under a keypad. A label, never fed back into
 * arithmetic.
 */
export function baseToPurchaseDisplay(baseQtyInBase, unitsPerBase, { decimalPlaces = 3 } = {}) {
  if (!Number.isInteger(baseQtyInBase) || !Number.isInteger(unitsPerBase) || unitsPerBase < 1) {
    return '';
  }

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
export const BASE_UNIT_SHORT_LABELS = Object.freeze({ G: 'g', ML: 'ml', PIECE: 'pc' });
