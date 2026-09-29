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
  computeBillTotals,
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
