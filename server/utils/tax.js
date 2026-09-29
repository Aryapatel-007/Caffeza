/**
 * GST arithmetic. All of it. Nothing outside this file computes tax.
 *
 * This is to tax what utils/money.js is to money, and for the same reason:
 * CONVENTIONS section 13 makes GST the one place where a quiet bug costs a
 * client money, so it gets one implementation and real tests.
 *
 * The rules, all decided in docs/PROJECT-STATE.md's decision log on 2026-08-30
 * and written up in docs/DB-SCHEMA.md section 12:
 *
 *   D1  Menu prices are tax-EXCLUSIVE. Tax is computed and added on top.
 *
 *   D2  Rounding happens ONCE PER RATE SLAB. Not per line, not on the bill
 *       total. Lines are grouped by taxRateBps, each group's taxable value is
 *       summed, and that group's tax is rounded once. Rounding each line and
 *       adding gives a different answer from adding and rounding once, and
 *       BUILD-PLAN section 8 names that as how a printed bill and a report end
 *       up a rupee apart. Per slab is chosen because that is exactly how a GST
 *       invoice prints.
 *
 *   D2a A bill-level discount reduces TAXABLE VALUE, so it is apportioned
 *       across slabs before tax is computed. It cannot simply come off the
 *       grand total, or the tax is overstated.
 *
 *   D3  Intra-state only. No IGST. Each slab splits in half and CGST takes the
 *       extra paisa when the total is odd.
 */
import { applyBasisPoints, MAX_PAISE, sumPaise } from './money.js';

/** A bill total is rounded to the nearest whole rupee. */
const PAISE_PER_RUPEE = 100;

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be a whole number of paise, received ${value}.`);
  }
}

/**
 * round_half_away_from_zero(amount * part / whole), in exact integer maths.
 *
 * Used to give each tax slab its share of a bill-level discount. The
 * multiplication happens before the division so the only rounding is the final
 * one, the same shape as applyBasisPoints.
 */
export function proportionalShare(amount, part, whole) {
  assertInteger(amount, 'proportionalShare amount');
  assertInteger(part, 'proportionalShare part');
  assertInteger(whole, 'proportionalShare whole');

  if (whole <= 0) {
    throw new RangeError('proportionalShare needs a positive whole to divide by.');
  }
  if (amount === 0 || part === 0) return 0;

  const product = amount * part;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(
      `proportionalShare(${amount}, ${part}, ${whole}) overflows exact integer arithmetic.`,
    );
  }

  const whole_ = Math.floor(product / whole);
  const remainder = product % whole;

  return remainder * 2 >= whole ? whole_ + 1 : whole_;
}

/**
 * Splits one slab's tax into CGST and SGST.
 *
 * An intra-state supply splits in half. When the slab's tax is an odd number of
 * paise the halves are unequal, and CGST takes the extra paisa, always. Fixing
 * the direction means the split is deterministic and the two parts always
 * re-add to the total, which is what a test asserts.
 */
export function splitCgstSgst(taxInPaise) {
  assertInteger(taxInPaise, 'splitCgstSgst amount');
  if (taxInPaise < 0) {
    throw new RangeError('Tax cannot be negative.');
  }

  const cgstInPaise = Math.ceil(taxInPaise / 2);
  return { cgstInPaise, sgstInPaise: taxInPaise - cgstInPaise };
}

/**
 * Resolves a discount request into a whole-paise amount.
 *
 * A percentage is applied to the pre-tax subtotal, because the discount is a
 * reduction of taxable value rather than of the final amount payable.
 */
export function resolveDiscountAmount(discount, subtotalInPaise) {
  if (!discount) return 0;
  assertInteger(subtotalInPaise, 'resolveDiscountAmount subtotal');

  if (discount.kind === 'FLAT') {
    assertInteger(discount.valueInPaise, 'A flat discount');
    return discount.valueInPaise;
  }

  if (discount.kind === 'PERCENT') {
    assertInteger(discount.rateBps, 'A percentage discount');
    return applyBasisPoints(subtotalInPaise, discount.rateBps);
  }

  throw new TypeError(`Unknown discount kind: ${discount.kind}`);
}

/**
 * Gives each slab its share of a bill-level discount.
 *
 * Shares are proportional to each slab's share of the subtotal, and then
 * corrected so they add up to the discount EXACTLY: the rounding remainder,
 * which is a few paise at most, is given to the slab with the largest taxable
 * value. Without that correction the shares can miss the discount by a paisa
 * and the grand total stops reconciling with its own parts.
 */
function apportionDiscount(slabSubtotals, discountAmountInPaise, subtotalInPaise) {
  const rates = [...slabSubtotals.keys()];
  if (discountAmountInPaise === 0 || subtotalInPaise === 0) {
    return new Map(rates.map((rate) => [rate, 0]));
  }

  const shares = new Map(
    rates.map((rate) => [
      rate,
      proportionalShare(discountAmountInPaise, slabSubtotals.get(rate), subtotalInPaise),
    ]),
  );

  const allocated = sumPaise(...shares.values());
  const remainder = discountAmountInPaise - allocated;

  if (remainder !== 0) {
    // The largest slab absorbs it: it is the one where a few paise move the
    // resulting tax least, in relative terms.
    const largest = rates.reduce((best, rate) =>
      slabSubtotals.get(rate) > slabSubtotals.get(best) ? rate : best,
    );
    shares.set(largest, shares.get(largest) + remainder);
  }

  return shares;
}

/**
 * Rounds a bill total to the nearest whole rupee.
 *
 * Returns the signed adjustment, which is what the bill stores and prints.
 * A remainder of exactly 50 paise rounds up, matching the half-away-from-zero
 * rule used everywhere else in this codebase.
 */
export function roundOffFor(preRoundTotalInPaise) {
  assertInteger(preRoundTotalInPaise, 'roundOffFor total');

  const remainder = preRoundTotalInPaise % PAISE_PER_RUPEE;
  if (remainder === 0) return 0;

  return remainder >= PAISE_PER_RUPEE / 2 ? PAISE_PER_RUPEE - remainder : -remainder;
}

/**
 * The whole bill, computed from its lines and an optional discount.
 *
 * `lines` are `{ taxRateBps, lineTotalInPaise }`. Cancelled order lines must
 * already have been filtered out by the caller: a cancelled line is evidence,
 * not something anyone is paying for.
 *
 * Returns every figure a bill stores, so a bill is never assembled from two
 * different sources of arithmetic.
 */
export function computeBillTotals({ lines, discount = null }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new RangeError('A bill needs at least one line.');
  }

  const subtotalInPaise = sumPaise(...lines.map((line) => line.lineTotalInPaise));
  if (subtotalInPaise > MAX_PAISE) {
    throw new RangeError(`A bill subtotal of ${subtotalInPaise} paise is beyond the sane ceiling.`);
  }

  const discountAmountInPaise = resolveDiscountAmount(discount, subtotalInPaise);
  if (discountAmountInPaise < 0) {
    throw new RangeError('A discount cannot be negative.');
  }
  if (discountAmountInPaise > subtotalInPaise) {
    throw new RangeError('A discount cannot be larger than the subtotal.');
  }

  /**
   * Group by rate. A Map keeps insertion order, but the breakdown is sorted by
   * rate below so a bill always prints its slabs in the same order regardless
   * of what order the lines happened to be added in.
   */
  const slabSubtotals = new Map();
  for (const line of lines) {
    assertInteger(line.taxRateBps, 'A line tax rate');
    assertInteger(line.lineTotalInPaise, 'A line total');
    const running = slabSubtotals.get(line.taxRateBps) ?? 0;
    slabSubtotals.set(line.taxRateBps, running + line.lineTotalInPaise);
  }

  const shares = apportionDiscount(slabSubtotals, discountAmountInPaise, subtotalInPaise);

  const taxBreakdown = [...slabSubtotals.keys()]
    .sort((a, b) => a - b)
    .map((taxRateBps) => {
      const taxableInPaise = slabSubtotals.get(taxRateBps) - shares.get(taxRateBps);
      const taxInPaise = applyBasisPoints(taxableInPaise, taxRateBps);
      const { cgstInPaise, sgstInPaise } = splitCgstSgst(taxInPaise);

      return { taxRateBps, taxableInPaise, taxInPaise, cgstInPaise, sgstInPaise };
    });

  const totalTaxInPaise = sumPaise(...taxBreakdown.map((slab) => slab.taxInPaise));
  const preRoundTotalInPaise = subtotalInPaise - discountAmountInPaise + totalTaxInPaise;
  const roundOffInPaise = roundOffFor(preRoundTotalInPaise);

  return {
    subtotalInPaise,
    discountAmountInPaise,
    taxBreakdown,
    totalTaxInPaise,
    roundOffInPaise,
    grandTotalInPaise: preRoundTotalInPaise + roundOffInPaise,
  };
}

export default {
  computeBillTotals,
  proportionalShare,
  resolveDiscountAmount,
  roundOffFor,
  splitCgstSgst,
};
