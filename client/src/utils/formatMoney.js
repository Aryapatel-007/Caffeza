/**
 * Money display, client side.
 *
 * The server sends paise. Every screen shows rupees. This is the one place
 * that converts, which is what docs/CONVENTIONS.md section 5 asks for.
 *
 * Nothing here goes back into arithmetic. The output is a label. A screen that
 * needs a total adds the paise and formats the result, never the reverse.
 */

const PAISE_PER_RUPEE = 100;

/**
 * Paise to a rupee string, with Indian grouping.
 *
 *   formatPaise(9999)     ->  Rs 99.99
 *   formatPaise(10000000) ->  Rs 1,00,000.00
 */
export function formatPaise(paise, { symbol = true } = {}) {
  if (!Number.isInteger(paise)) return '';

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(paise) / PAISE_PER_RUPEE);

  const sign = paise < 0 ? '-' : '';
  return symbol ? `${sign}₹${formatted}` : `${sign}${formatted}`;
}

/** Basis points as a percentage label. 1800 becomes 18% */
export function formatBasisPoints(basisPoints) {
  if (!Number.isInteger(basisPoints)) return '';
  const percent = basisPoints / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

/**
 * Rupees typed into a form, to whole paise.
 *
 * The mirror of formatPaise, and the only place the client turns a typed
 * amount into the integer the API wants. Everything crossing the wire is paise.
 *
 * Rounds half away from zero on the decimal digits rather than by multiplying
 * a float by 100, because 99.99 * 100 is 9998.999999999998 in IEEE 754 and
 * truncating that loses a paisa on every bill. server/utils/money.js does the
 * same thing the same way, so the two can never disagree.
 *
 * Returns null for anything that is not a plain amount, so a caller can show a
 * field error rather than sending NaN.
 */
export function parseRupeesToPaise(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return parseRupeesToPaise(String(input));
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;

  const [, sign, whole, fraction = ''] = match;

  let paise = Number(whole) * PAISE_PER_RUPEE + Number(fraction.slice(0, 2).padEnd(2, '0'));

  const remainder = fraction.slice(2);
  if (remainder.length > 0 && Number(remainder[0]) >= 5) paise += 1;

  if (!Number.isSafeInteger(paise)) return null;
  return sign === '-' ? -paise : paise;
}

/** Paise to the plain editable string a number input shows. No symbol, no grouping. */
export function paiseToInput(paise) {
  if (!Number.isInteger(paise)) return '';
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / PAISE_PER_RUPEE)}.${String(abs % PAISE_PER_RUPEE).padStart(2, '0')}`;
}
