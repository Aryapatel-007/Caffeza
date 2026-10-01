/**
 * GST arithmetic tests.
 *
 * CONVENTIONS section 13: money and GST calculation logic gets real automated
 * tests, because it is the one place where a quiet bug costs a client money.
 * These run without a database or a server.
 *
 * The three that matter most are marked. They are the three failure shapes
 * BUILD-PLAN section 8 predicts: per-line rounding disagreeing with per-slab,
 * the odd paisa in the CGST/SGST split, and a discount that does not reconcile.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyBasisPoints, sumPaise } from '../utils/money.js';
import {
  allocateLineShares,
  computeBillTotals,
  largestRemainderSplit,
  proportionalShare,
  resolveDiscountAmount,
  roundOffFor,
  splitCgstSgst,
} from '../utils/tax.js';

describe('splitCgstSgst', () => {
  it('splits an even tax exactly in half', () => {
    assert.deepEqual(splitCgstSgst(1000), { cgstInPaise: 500, sgstInPaise: 500 });
  });

  it('gives the extra paisa to CGST when the tax is odd', () => {
    // THE ODD PAISA. Fixed direction, so the split is deterministic.
    assert.deepEqual(splitCgstSgst(1001), { cgstInPaise: 501, sgstInPaise: 500 });
    assert.deepEqual(splitCgstSgst(7), { cgstInPaise: 4, sgstInPaise: 3 });
  });

  it('always re-adds to the total it was given', () => {
    for (let tax = 0; tax <= 500; tax += 1) {
      const { cgstInPaise, sgstInPaise } = splitCgstSgst(tax);
      assert.equal(cgstInPaise + sgstInPaise, tax, `split of ${tax} did not re-add`);
      assert.ok(cgstInPaise >= sgstInPaise, 'CGST is never the smaller half');
      assert.ok(cgstInPaise - sgstInPaise <= 1, 'the halves never differ by more than a paisa');
    }
  });

  it('refuses a negative tax', () => {
    assert.throws(() => splitCgstSgst(-1), RangeError);
  });
});

describe('roundOffFor', () => {
  it('is zero on a whole rupee', () => {
    assert.equal(roundOffFor(10000), 0);
  });

  it('rounds down below fifty paise and up at or above it', () => {
    assert.equal(roundOffFor(10049), -49);
    assert.equal(roundOffFor(10050), 50);
    assert.equal(roundOffFor(10051), 49);
    assert.equal(roundOffFor(10001), -1);
    assert.equal(roundOffFor(10099), 1);
  });

  it('always lands the total on a whole rupee, and stays inside the stored range', () => {
    for (let total = 10000; total <= 10200; total += 1) {
      const off = roundOffFor(total);
      assert.equal((total + off) % 100, 0, `${total} did not round to a rupee`);
      assert.ok(off >= -49 && off <= 50, `${off} is outside the range the schema allows`);
    }
  });
});

describe('proportionalShare', () => {
  it('splits exactly when it divides evenly', () => {
    assert.equal(proportionalShare(1000, 500, 1000), 500);
    assert.equal(proportionalShare(1000, 250, 1000), 250);
  });

  it('rounds half away from zero', () => {
    // 100 * 1 / 8 = 12.5 -> 13
    assert.equal(proportionalShare(100, 1, 8), 13);
  });

  it('is zero when there is nothing to share', () => {
    assert.equal(proportionalShare(0, 500, 1000), 0);
    assert.equal(proportionalShare(1000, 0, 1000), 0);
  });

  it('refuses to divide by zero', () => {
    assert.throws(() => proportionalShare(100, 50, 0), RangeError);
  });
});

describe('resolveDiscountAmount', () => {
  it('is zero when there is no discount', () => {
    assert.equal(resolveDiscountAmount(null, 10000), 0);
  });

  it('takes a flat amount as given', () => {
    assert.equal(resolveDiscountAmount({ kind: 'FLAT', valueInPaise: 5000 }, 40000), 5000);
  });

  it('applies a percentage to the pre-tax subtotal', () => {
    // 10% of 400 rupees, off the taxable value rather than the payable total.
    assert.equal(resolveDiscountAmount({ kind: 'PERCENT', rateBps: 1000 }, 40000), 4000);
  });

  it('refuses a kind it does not know', () => {
    assert.throws(() => resolveDiscountAmount({ kind: 'BOGOF' }, 10000), TypeError);
  });
});

describe('computeBillTotals, one slab', () => {
  it('adds 5% to a single line and rounds the total to a rupee', () => {
    const totals = computeBillTotals({
      lines: [{ taxRateBps: 500, lineTotalInPaise: 24000 }],
    });

    assert.equal(totals.subtotalInPaise, 24000);
    assert.equal(totals.totalTaxInPaise, 1200);
    assert.deepEqual(totals.taxBreakdown, [
      { taxRateBps: 500, taxableInPaise: 24000, taxInPaise: 1200, cgstInPaise: 600, sgstInPaise: 600 },
    ]);
    assert.equal(totals.roundOffInPaise, 0);
    assert.equal(totals.grandTotalInPaise, 25200);
  });

  it('keeps a zero-rated slab in the breakdown rather than dropping it', () => {
    // An exempt item still prints, showing its taxable value at 0%.
    const totals = computeBillTotals({
      lines: [{ taxRateBps: 0, lineTotalInPaise: 10000 }],
    });

    assert.equal(totals.taxBreakdown.length, 1);
    assert.deepEqual(totals.taxBreakdown[0], {
      taxRateBps: 0,
      taxableInPaise: 10000,
      taxInPaise: 0,
      cgstInPaise: 0,
      sgstInPaise: 0,
    });
    assert.equal(totals.grandTotalInPaise, 10000);
  });
});

describe('computeBillTotals, the per-slab rounding rule', () => {
  it('rounds once per slab, not once per line', () => {
    /**
     * THE ROUNDING RULE. This is the test that pins D2.
     *
     * Three lines at 5%, each 3333 paise. Per line the tax is
     * round(166.65) = 167 each, totalling 501. Per slab it is
     * round(3 * 3333 * 5%) = round(499.95) = 500.
     *
     * One paisa. Every day, on every multi-line bill, in a different direction
     * each time, until the printed bill and the M6 report disagree and nobody
     * trusts either. BUILD-PLAN section 8.
     */
    const lines = [
      { taxRateBps: 500, lineTotalInPaise: 3333 },
      { taxRateBps: 500, lineTotalInPaise: 3333 },
      { taxRateBps: 500, lineTotalInPaise: 3333 },
    ];

    const perLine = sumPaise(...lines.map((l) => applyBasisPoints(l.lineTotalInPaise, l.taxRateBps)));
    assert.equal(perLine, 501, 'the per-line answer, which we deliberately do not use');

    const totals = computeBillTotals({ lines });
    assert.equal(totals.totalTaxInPaise, 500, 'the per-slab answer, which is the rule');
    assert.notEqual(totals.totalTaxInPaise, perLine, 'the two really do differ here');
  });

  it('groups several rates and sorts the breakdown by rate', () => {
    const totals = computeBillTotals({
      lines: [
        { taxRateBps: 1800, lineTotalInPaise: 12000 },
        { taxRateBps: 500, lineTotalInPaise: 24000 },
        { taxRateBps: 500, lineTotalInPaise: 6000 },
        { taxRateBps: 0, lineTotalInPaise: 5000 },
      ],
    });

    assert.deepEqual(
      totals.taxBreakdown.map((slab) => slab.taxRateBps),
      [0, 500, 1800],
      'slabs always print in rate order, whatever order the lines arrived in',
    );

    const fivePercent = totals.taxBreakdown.find((slab) => slab.taxRateBps === 500);
    assert.equal(fivePercent.taxableInPaise, 30000, 'the two 5% lines are summed before rounding');
    assert.equal(fivePercent.taxInPaise, 1500);

    assert.equal(totals.subtotalInPaise, 47000);
    assert.equal(totals.totalTaxInPaise, 1500 + 2160);
  });

  it('the slabs always re-add to the reported total tax', () => {
    const totals = computeBillTotals({
      lines: [
        { taxRateBps: 500, lineTotalInPaise: 3333 },
        { taxRateBps: 1800, lineTotalInPaise: 777 },
        { taxRateBps: 0, lineTotalInPaise: 1 },
      ],
    });

    const readded = sumPaise(...totals.taxBreakdown.map((slab) => slab.taxInPaise));
    assert.equal(readded, totals.totalTaxInPaise);

    for (const slab of totals.taxBreakdown) {
      assert.equal(slab.cgstInPaise + slab.sgstInPaise, slab.taxInPaise);
    }
  });
});

describe('computeBillTotals, discounts', () => {
  it('takes a flat discount off taxable value, not off the payable total', () => {
    const totals = computeBillTotals({
      lines: [{ taxRateBps: 500, lineTotalInPaise: 40000 }],
      discount: { kind: 'FLAT', valueInPaise: 4000 },
    });

    // Taxed on 360, not on 400. Taking it off the grand total would overstate
    // the tax by 5% of the discount.
    assert.equal(totals.taxBreakdown[0].taxableInPaise, 36000);
    assert.equal(totals.totalTaxInPaise, 1800);
    assert.equal(totals.grandTotalInPaise, 40000 - 4000 + 1800);
  });

  it('apportions a discount across slabs in proportion to each slab', () => {
    const totals = computeBillTotals({
      lines: [
        { taxRateBps: 500, lineTotalInPaise: 30000 },
        { taxRateBps: 1800, lineTotalInPaise: 10000 },
      ],
      discount: { kind: 'PERCENT', rateBps: 1000 },
    });

    // 10% of 400 rupees is 40. Three quarters of the subtotal is at 5%, so
    // 30 rupees of the discount lands there and 10 on the 18% slab.
    assert.equal(totals.discountAmountInPaise, 4000);
    const five = totals.taxBreakdown.find((s) => s.taxRateBps === 500);
    const eighteen = totals.taxBreakdown.find((s) => s.taxRateBps === 1800);
    assert.equal(five.taxableInPaise, 27000);
    assert.equal(eighteen.taxableInPaise, 9000);
  });

  it('apportioned shares always add back up to the discount exactly', () => {
    /**
     * THE RECONCILIATION. A discount that splits into thirds cannot be shared
     * out in whole paise without a remainder, and the remainder has to land
     * somewhere or the grand total stops reconciling with its own parts.
     */
    const totals = computeBillTotals({
      lines: [
        { taxRateBps: 500, lineTotalInPaise: 3333 },
        { taxRateBps: 1800, lineTotalInPaise: 3333 },
        { taxRateBps: 0, lineTotalInPaise: 3334 },
      ],
      discount: { kind: 'FLAT', valueInPaise: 1000 },
    });

    const taxableTotal = sumPaise(...totals.taxBreakdown.map((s) => s.taxableInPaise));
    assert.equal(
      taxableTotal,
      totals.subtotalInPaise - totals.discountAmountInPaise,
      'every paisa of the discount landed on exactly one slab',
    );
  });

  it('handles a discount of the entire subtotal', () => {
    const totals = computeBillTotals({
      lines: [{ taxRateBps: 500, lineTotalInPaise: 10000 }],
      discount: { kind: 'FLAT', valueInPaise: 10000 },
    });

    assert.equal(totals.taxBreakdown[0].taxableInPaise, 0);
    assert.equal(totals.totalTaxInPaise, 0);
    assert.equal(totals.grandTotalInPaise, 0);
  });

  it('refuses a discount larger than the subtotal', () => {
    assert.throws(
      () =>
        computeBillTotals({
          lines: [{ taxRateBps: 500, lineTotalInPaise: 10000 }],
          discount: { kind: 'FLAT', valueInPaise: 10001 },
        }),
      RangeError,
    );
  });
});

describe('computeBillTotals, the whole thing reconciles', () => {
  it('grand total always equals subtotal minus discount plus tax plus round-off', () => {
    const cases = [
      [{ taxRateBps: 500, lineTotalInPaise: 24000 }],
      [
        { taxRateBps: 500, lineTotalInPaise: 3333 },
        { taxRateBps: 1800, lineTotalInPaise: 777 },
      ],
      [
        { taxRateBps: 0, lineTotalInPaise: 1 },
        { taxRateBps: 500, lineTotalInPaise: 99 },
        { taxRateBps: 1800, lineTotalInPaise: 12345 },
      ],
    ];

    for (const lines of cases) {
      for (const discount of [null, { kind: 'FLAT', valueInPaise: 1 }, { kind: 'PERCENT', rateBps: 750 }]) {
        const totals = computeBillTotals({ lines, discount });

        assert.equal(
          totals.grandTotalInPaise,
          totals.subtotalInPaise -
            totals.discountAmountInPaise +
            totals.totalTaxInPaise +
            totals.roundOffInPaise,
          `did not reconcile for ${JSON.stringify({ lines, discount })}`,
        );

        assert.equal(
          totals.grandTotalInPaise % 100,
          0,
          'a grand total is always a whole number of rupees',
        );
      }
    }
  });

  it('refuses a bill with no lines', () => {
    assert.throws(() => computeBillTotals({ lines: [] }), RangeError);
  });

  it('refuses a fractional line total rather than rounding it silently', () => {
    assert.throws(
      () => computeBillTotals({ lines: [{ taxRateBps: 500, lineTotalInPaise: 100.5 }] }),
      TypeError,
    );
  });
});

/* --------------------------------------------------------------------------
 * Line shares. P03.
 * ----------------------------------------------------------------------- */

describe('largestRemainderSplit', () => {
  it('returns zeros for a zero amount, and for all-zero weights', () => {
    assert.deepEqual(largestRemainderSplit(0, [5, 7]), [0, 0]);
    assert.deepEqual(largestRemainderSplit(100, [0, 0, 0]), [0, 0, 0]);
    assert.deepEqual(largestRemainderSplit(100, []), []);
  });

  it('gives everything to a single weight', () => {
    assert.deepEqual(largestRemainderSplit(1234, [99]), [1234]);
  });

  it('gives leftover paise to the earlier parts when the weights are equal', () => {
    assert.deepEqual(largestRemainderSplit(10, [1, 1, 1]), [4, 3, 3]);
    assert.deepEqual(largestRemainderSplit(11, [1, 1, 1]), [4, 4, 3]);
  });

  it('gives a leftover paisa to a later part when its fraction is bigger', () => {
    // 10 split 1:2 is 3.33 and 6.67. The later part has the bigger fraction.
    assert.deepEqual(largestRemainderSplit(10, [1, 2]), [3, 7]);
  });

  it('stays exact where floating point would not', () => {
    // amount × weight is 10^16, past Number.MAX_SAFE_INTEGER.
    const amount = 100_000_000;
    const weights = [100_000_000, 100_000_000, 100_000_001];
    const parts = largestRemainderSplit(amount, weights);
    assert.equal(sumPaise(...parts), amount);
    assert.deepEqual(parts, [33_333_333, 33_333_333, 33_333_334]);
  });

  it('refuses a negative amount, a negative weight and a decimal', () => {
    assert.throws(() => largestRemainderSplit(-1, [1]), RangeError);
    assert.throws(() => largestRemainderSplit(10, [1, -1]), RangeError);
    assert.throws(() => largestRemainderSplit(10.5, [1]), TypeError);
    assert.throws(() => largestRemainderSplit(10, [1.5]), TypeError);
  });
});

/** Builds a bill from line totals at one rate, applies a discount, and splits it. */
function sharesFor(lineTotals, taxRateBps, discount = null) {
  const lines = lineTotals.map((lineTotalInPaise) => ({ taxRateBps, lineTotalInPaise }));
  const totals = computeBillTotals({ lines, discount });
  return { totals, shares: allocateLineShares(lines, totals) };
}

const asRows = (shares) =>
  shares.map((share) => [share.discountShareInPaise, share.taxableInPaise, share.taxInPaise]);

describe('allocateLineShares reproduces the golden day, docs/TEST-DATA.md section 3', () => {
  it('B01, 10% off Rs 530 at 5%', () => {
    const { totals, shares } = sharesFor([18000, 32000, 3000], 500, { kind: 'PERCENT', rateBps: 1000 });
    assert.deepEqual(asRows(shares), [
      [1800, 16200, 810],
      [3200, 28800, 1440],
      [300, 2700, 135],
    ]);
    assert.equal(totals.taxBreakdown[0].cgstInPaise, 1193);
    assert.equal(totals.taxBreakdown[0].sgstInPaise, 1192);
    assert.equal(totals.roundOffInPaise, 15);
    assert.equal(totals.grandTotalInPaise, 50100);
  });

  it('B02, flat 7307 off Rs 1450 at 5%, Caffeza bill C22276', () => {
    const { totals, shares } = sharesFor(
      [45000, 40000, 28000, 8000, 8000, 8000, 8000],
      500,
      { kind: 'FLAT', valueInPaise: 7307 },
    );
    assert.deepEqual(asRows(shares), [
      [2268, 42732, 2137],
      [2016, 37984, 1899],
      [1411, 26589, 1329],
      [403, 7597, 380],
      [403, 7597, 380],
      [403, 7597, 380],
      [403, 7597, 380],
    ]);
    assert.equal(totals.taxBreakdown[0].cgstInPaise, 3443);
    assert.equal(totals.taxBreakdown[0].sgstInPaise, 3442);
    assert.equal(totals.roundOffInPaise, 22);
    assert.equal(totals.grandTotalInPaise, 144600);
  });

  it('B08, flat 20000 off Rs 505 at 0%', () => {
    const { totals, shares } = sharesFor([33000, 17500], 0, { kind: 'FLAT', valueInPaise: 20000 });
    assert.deepEqual(asRows(shares), [
      [13069, 19931, 0],
      [6931, 10569, 0],
    ]);
    assert.equal(totals.grandTotalInPaise, 30500);
  });

  it('B14, flat 1383 off Rs 540 at 5%', () => {
    const { totals, shares } = sharesFor([36000, 18000], 500, { kind: 'FLAT', valueInPaise: 1383 });
    assert.deepEqual(asRows(shares), [
      [922, 35078, 1754],
      [461, 17539, 877],
    ]);
    assert.equal(totals.taxBreakdown[0].cgstInPaise, 1316);
    assert.equal(totals.taxBreakdown[0].sgstInPaise, 1315);
    assert.equal(totals.roundOffInPaise, -48);
    assert.equal(totals.grandTotalInPaise, 55200);
  });

  it('B16, flat 3900 off Rs 780 at 5%', () => {
    const { totals, shares } = sharesFor([45000, 33000], 500, { kind: 'FLAT', valueInPaise: 3900 });
    assert.deepEqual(asRows(shares), [
      [2250, 42750, 2138],
      [1650, 31350, 1567],
    ]);
    assert.equal(totals.taxBreakdown[0].cgstInPaise, 1853);
    assert.equal(totals.taxBreakdown[0].sgstInPaise, 1852);
    assert.equal(totals.roundOffInPaise, -5);
    assert.equal(totals.grandTotalInPaise, 77800);
  });

  it('B05, no discount, Rs 757.61 at 5% with the water bottle at 4761', () => {
    const { totals, shares } = sharesFor([38000, 33000, 4761], 500);
    assert.deepEqual(asRows(shares), [
      [0, 38000, 1900],
      [0, 33000, 1650],
      [0, 4761, 238],
    ]);
    assert.equal(totals.taxBreakdown[0].cgstInPaise, 1894);
    assert.equal(totals.taxBreakdown[0].sgstInPaise, 1894);
    assert.equal(totals.roundOffInPaise, -49);
    assert.equal(totals.grandTotalInPaise, 79500);
  });
});

/** C2 from docs/RECONCILIATION-RULES.md, checked from the outside. Returns a failure or null. */
function checkC2(lines, totals, shares) {
  const discountSum = sumPaise(...shares.map((share) => share.discountShareInPaise));
  if (discountSum !== totals.discountAmountInPaise) {
    return `C2.1 discount shares ${discountSum} vs bill discount ${totals.discountAmountInPaise}`;
  }
  for (const slab of totals.taxBreakdown) {
    const mine = shares.filter((_, index) => lines[index].taxRateBps === slab.taxRateBps);
    const taxable = sumPaise(...mine.map((share) => share.taxableInPaise));
    const tax = sumPaise(...mine.map((share) => share.taxInPaise));
    if (taxable !== slab.taxableInPaise) return `C2.2 at ${slab.taxRateBps}: ${taxable} vs ${slab.taxableInPaise}`;
    if (tax !== slab.taxInPaise) return `C2.3 at ${slab.taxRateBps}: ${tax} vs ${slab.taxInPaise}`;
  }
  for (const [index, share] of shares.entries()) {
    if (share.taxableInPaise !== lines[index].lineTotalInPaise - share.discountShareInPaise) {
      return `line ${index} taxable is not line total minus its discount share`;
    }
    if (share.discountShareInPaise < 0 || share.taxInPaise < 0 || share.taxableInPaise < 0) {
      return `line ${index} has a negative share`;
    }
  }
  return null;
}

/** C1 from docs/RECONCILIATION-RULES.md. Returns a failure or null. */
function checkC1(lines, totals) {
  const itemTotal = sumPaise(...lines.map((line) => line.lineTotalInPaise));
  if (itemTotal !== totals.subtotalInPaise) return 'C1.1 item total';
  const slabNet = sumPaise(...totals.taxBreakdown.map((slab) => slab.taxableInPaise));
  if (totals.subtotalInPaise - totals.discountAmountInPaise !== slabNet) return 'C1.2 net sales';
  for (const slab of totals.taxBreakdown) {
    if (slab.cgstInPaise + slab.sgstInPaise !== slab.taxInPaise) return 'C1.3 CGST + SGST';
  }
  const gst = sumPaise(...totals.taxBreakdown.map((slab) => slab.taxInPaise));
  if (gst !== totals.totalTaxInPaise) return 'C1.4 GST';
  if (slabNet + gst + totals.roundOffInPaise !== totals.grandTotalInPaise) return 'C1.5 bill total';
  if (totals.roundOffInPaise < -49 || totals.roundOffInPaise > 50) return 'C1.6 round-off';
  return null;
}

describe('allocateLineShares across tax rates', () => {
  it('keeps every share inside its own rate, and C2 holds for each rate', () => {
    const lines = [
      { taxRateBps: 500, lineTotalInPaise: 24000 },
      { taxRateBps: 1800, lineTotalInPaise: 15000 },
      { taxRateBps: 500, lineTotalInPaise: 9900 },
      { taxRateBps: 0, lineTotalInPaise: 4000 },
      { taxRateBps: 1800, lineTotalInPaise: 3333 },
    ];
    const totals = computeBillTotals({ lines, discount: { kind: 'FLAT', valueInPaise: 4321 } });
    const shares = allocateLineShares(lines, totals);

    assert.equal(checkC2(lines, totals, shares), null);
    assert.equal(shares[3].taxInPaise, 0, 'a 0% line carries no GST share');
  });
});

/** mulberry32: a tiny seeded generator, so a failing bill can be replayed exactly. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('line shares property test', () => {
  /**
   * 2,000 random bills. C1 and C2 must hold for every one, to the paisa.
   * The seed is fixed so a failure can be repeated; it is printed with the bill.
   */
  it('C1 and C2 hold for 2,000 random bills', () => {
    const SEED = 20261001;
    const random = seededRandom(SEED);
    const between = (low, high) => low + Math.floor(random() * (high - low + 1));
    const RATES = [0, 500, 1200, 1800];

    for (let bill = 0; bill < 2000; bill += 1) {
      const lines = Array.from({ length: between(1, 15) }, () => {
        const quantity = between(1, 5);
        const unitPrice = between(1, 500_000);
        return { taxRateBps: RATES[between(0, 3)], lineTotalInPaise: quantity * unitPrice };
      });
      const subtotal = sumPaise(...lines.map((line) => line.lineTotalInPaise));

      const kind = between(0, 2);
      const discount =
        kind === 0
          ? null
          : kind === 1
            ? { kind: 'PERCENT', rateBps: between(1, 10_000) }
            : { kind: 'FLAT', valueInPaise: between(1, subtotal) };

      let failure;
      try {
        const totals = computeBillTotals({ lines, discount });
        const shares = allocateLineShares(lines, totals);
        failure = checkC1(lines, totals) ?? checkC2(lines, totals, shares);
      } catch (error) {
        failure = error.message;
      }

      assert.equal(
        failure,
        null,
        `seed ${SEED}, bill ${bill}: ${failure}\n${JSON.stringify({ lines, discount })}`,
      );
    }
  });
});
