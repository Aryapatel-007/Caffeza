/**
 * Money.
 *
 * Every amount in this system is a whole number of paise. One hundred rupees
 * is 10000. There is no decimal anywhere, ever, at any point in the pipeline.
 *
 * Percentages are basis points, also whole integers. Five percent is 500,
 * eighteen percent is 1800. This is why there is no 0.18 in the codebase and
 * therefore no floating point surprise on a GST line.
 *
 * Nothing in here silently coerces. A function that quietly accepts "99.99"
 * where an integer was required is how a float reaches a bill.
 */

/** Ten lakh rupees. A sane ceiling for a single amount on a restaurant bill. */
export const MAX_PAISE = 100_000_000;

export const PAISE_PER_RUPEE = 100;
export const BASIS_POINTS_DIVISOR = 10_000;

function assertInteger(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be a whole number of paise, received ${describe(value)}.`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} is too large to be represented exactly: ${value}.`);
  }
}

function describe(value) {
  if (typeof value === 'string') return `the string "${value}"`;
  if (typeof value === 'number') return `the number ${value}`;
  return `a value of type ${typeof value}`;
}

/**
 * Rupees to paise.
 *
 * Accepts a number or a string, because a price typed into a form arrives as a
 * string and converting it in two different places is how two answers appear.
 *
 * Rounds half away from zero, so 0.005 becomes 1 paisa and -0.005 becomes -1.
 * The rounding is done on the digits of the decimal string, not by multiplying
 * a float by 100, because 99.99 * 100 is 9998.999999999998 in IEEE 754.
 *
 *   rupeesToPaise("99.99")  ->  9999
 *   rupeesToPaise(100)      ->  10000
 *   rupeesToPaise("1.005")  ->  101
 *
 * Throws on anything that is not a valid amount, including an empty string,
 * a currency symbol, a thousands separator, or exponent notation.
 */
export function rupeesToPaise(rupees) {
  if (typeof rupees !== 'number' && typeof rupees !== 'string') {
    throw new TypeError(`rupeesToPaise expects a number or a string, received ${describe(rupees)}.`);
  }

  if (typeof rupees === 'number' && !Number.isFinite(rupees)) {
    throw new RangeError(`rupeesToPaise received ${rupees}, which is not a finite amount.`);
  }

  const text = typeof rupees === 'number' ? String(rupees) : rupees.trim();

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new TypeError(
      `rupeesToPaise could not read ${describe(rupees)} as an amount. Expected digits with at most one decimal point, for example "99.99".`,
    );
  }

  const [, sign, wholePart, fractionPart = ''] = match;

  const whole = Number(wholePart);
  const paiseDigits = Number(fractionPart.slice(0, 2).padEnd(2, '0'));
  let paise = whole * PAISE_PER_RUPEE + paiseDigits;

  // Round half away from zero on the third decimal place onward.
  const remainder = fractionPart.slice(2);
  if (remainder.length > 0 && Number(remainder[0]) >= 5) paise += 1;

  const signed = sign === '-' ? -paise : paise;
  assertInteger(signed, 'The converted amount');
  return signed;
}

/**
 * Paise to a rupee string, for display only.
 *
 * Never feed the result of this back into arithmetic. It is a label.
 *
 * Grouping is Indian, so 10000000 paise reads as 1,00,000.00 and not
 * 100,000.00. The rupee symbol is left off by default because thermal
 * receipt printers are unreliable with it.
 */
export function paiseToRupees(paise, { symbol = false } = {}) {
  assertInteger(paise, 'paiseToRupees expects paise, which');

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(paise) / PAISE_PER_RUPEE);

  const sign = paise < 0 ? '-' : '';
  return symbol ? `${sign}₹${formatted}` : `${sign}${formatted}`;
}

/**
 * Applies a rate in basis points to an amount in paise.
 *
 * This is how GST is applied. Both inputs are integers and the multiplication
 * happens before the division, so the only rounding is the final one.
 *
 *   applyBasisPoints(10000, 1800)  ->  1800     (18% of 100 rupees)
 *   applyBasisPoints(9999, 500)    ->  500      (5% of 99.99 rupees)
 *
 * Rounds half away from zero, matching rupeesToPaise. Whether GST is rounded
 * per line or on the bill total is a decision for M3, not a decision this
 * function gets to make on its own.
 */
export function applyBasisPoints(paise, basisPoints) {
  assertInteger(paise, 'applyBasisPoints amount');
  assertInteger(basisPoints, 'applyBasisPoints rate');

  if (basisPoints < 0) {
    throw new RangeError(`A rate cannot be negative, received ${basisPoints} basis points.`);
  }

  const product = paise * basisPoints;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(
      `applyBasisPoints(${paise}, ${basisPoints}) overflows exact integer arithmetic.`,
    );
  }

  const magnitude = Math.abs(product);
  const whole = Math.floor(magnitude / BASIS_POINTS_DIVISOR);
  const remainder = magnitude % BASIS_POINTS_DIVISOR;
  const rounded = remainder * 2 >= BASIS_POINTS_DIVISOR ? whole + 1 : whole;

  return product < 0 ? -rounded : rounded;
}

/**
 * Adds amounts in paise.
 *
 * Every input is checked first. Adding one silent float to a list of integers
 * produces a total that is wrong by a fraction of a paisa, which then rounds
 * into a rupee somewhere further down and makes the bill and the report
 * disagree.
 */
export function sumPaise(...amounts) {
  let total = 0;
  amounts.forEach((amount, index) => {
    assertInteger(amount, `sumPaise argument ${index + 1}`);
    total += amount;
  });

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`sumPaise total ${total} is too large to be represented exactly.`);
  }
  return total;
}
