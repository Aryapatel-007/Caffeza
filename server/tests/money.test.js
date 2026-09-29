/**
 * Money tests.
 *
 * This is the one file in the codebase where a quiet bug costs a client actual
 * money, so it gets real tests rather than a manual check.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyBasisPoints,
  MAX_PAISE,
  paiseToRupees,
  rupeesToPaise,
  sumPaise,
} from '../utils/money.js';

describe('rupeesToPaise', () => {
  it('converts the values from the spec exactly', () => {
    assert.equal(rupeesToPaise('99.99'), 9999);
    assert.equal(rupeesToPaise(100), 10000);
    assert.equal(rupeesToPaise('0'), 0);
  });

  it('does not lose a paisa to floating point', () => {
    // 99.99 * 100 is 9998.999999999998 in IEEE 754. Truncating that gives 9998
    // and every bill in the system is a paisa short.
    assert.equal(rupeesToPaise(99.99), 9999);
    assert.equal(rupeesToPaise(0.29), 29);
    assert.equal(rupeesToPaise(1.1), 110);
    assert.equal(rupeesToPaise('8.29'), 829);
  });

  it('rounds half up, not half to even', () => {
    assert.equal(rupeesToPaise('1.005'), 101);
    assert.equal(rupeesToPaise('1.015'), 102);
    assert.equal(rupeesToPaise('1.0049'), 100);
    assert.equal(rupeesToPaise('0.005'), 1);
  });

  it('rounds half away from zero for negative amounts', () => {
    assert.equal(rupeesToPaise('-99.99'), -9999);
    assert.equal(rupeesToPaise('-1.005'), -101);
  });

  it('accepts a string or a number, and nothing else', () => {
    assert.equal(rupeesToPaise('  12.50  '), 1250);
    assert.throws(() => rupeesToPaise(null), TypeError);
    assert.throws(() => rupeesToPaise(undefined), TypeError);
    assert.throws(() => rupeesToPaise({}), TypeError);
    assert.throws(() => rupeesToPaise([12]), TypeError);
    assert.throws(() => rupeesToPaise(true), TypeError);
  });

  it('rejects anything that is not plainly an amount', () => {
    assert.throws(() => rupeesToPaise(''), TypeError);
    assert.throws(() => rupeesToPaise('   '), TypeError);
    assert.throws(() => rupeesToPaise('abc'), TypeError);
    assert.throws(() => rupeesToPaise('12.34.56'), TypeError);
    assert.throws(() => rupeesToPaise('1,200.00'), TypeError);
    assert.throws(() => rupeesToPaise('Rs 100'), TypeError);
    assert.throws(() => rupeesToPaise('1e3'), TypeError);
    assert.throws(() => rupeesToPaise(Number.NaN), RangeError);
    assert.throws(() => rupeesToPaise(Number.POSITIVE_INFINITY), RangeError);
  });
});

describe('applyBasisPoints', () => {
  it('applies GST rates exactly', () => {
    // 18% of 100 rupees.
    assert.equal(applyBasisPoints(10000, 1800), 1800);
    // 5% of 100 rupees.
    assert.equal(applyBasisPoints(10000, 500), 500);
    // 12% of 250 rupees.
    assert.equal(applyBasisPoints(25000, 1200), 3000);
  });

  it('rounds only at the final step, half away from zero', () => {
    // 5% of 99.99 is 4.9995 rupees, which is 499.95 paise.
    assert.equal(applyBasisPoints(9999, 500), 500);
    // 18% of 0.01 is 0.0018 paise.
    assert.equal(applyBasisPoints(1, 1800), 0);
    // Exactly one half rounds up.
    assert.equal(applyBasisPoints(5, 1000), 1);
  });

  it('returns zero for a zero rate or a zero amount', () => {
    assert.equal(applyBasisPoints(12345, 0), 0);
    assert.equal(applyBasisPoints(0, 1800), 0);
  });

  it('returns 100 percent of the amount for 10000 basis points', () => {
    assert.equal(applyBasisPoints(123456, 10000), 123456);
  });

  it('refuses a non-integer input rather than coercing it', () => {
    assert.throws(() => applyBasisPoints(100.5, 1800), TypeError);
    assert.throws(() => applyBasisPoints(10000, 18.5), TypeError);
    assert.throws(() => applyBasisPoints('10000', 1800), TypeError);
    assert.throws(() => applyBasisPoints(10000, '1800'), TypeError);
  });

  it('refuses a negative rate', () => {
    assert.throws(() => applyBasisPoints(10000, -500), RangeError);
  });
});

describe('sumPaise', () => {
  it('adds integers', () => {
    assert.equal(sumPaise(), 0);
    assert.equal(sumPaise(10000, 2500, 799), 13299);
    assert.equal(sumPaise(10000, -2500), 7500);
  });

  it('refuses to add a float hiding among the integers', () => {
    assert.throws(() => sumPaise(10000, 25.5), TypeError);
    assert.throws(() => sumPaise(10000, '2500'), TypeError);
    assert.throws(() => sumPaise(10000, null), TypeError);
    assert.throws(() => sumPaise(10000, Number.NaN), TypeError);
  });

  it('names the argument that was wrong', () => {
    assert.throws(() => sumPaise(1, 2, 3.5), /argument 3/);
  });
});

describe('paiseToRupees', () => {
  it('formats with Indian grouping', () => {
    assert.equal(paiseToRupees(9999), '99.99');
    assert.equal(paiseToRupees(10000), '100.00');
    assert.equal(paiseToRupees(0), '0.00');
    assert.equal(paiseToRupees(10000000), '1,00,000.00');
    assert.equal(paiseToRupees(-9999), '-99.99');
  });

  it('adds the symbol only when asked', () => {
    assert.equal(paiseToRupees(9999, { symbol: true }), '₹99.99');
  });

  it('refuses anything that is not paise', () => {
    assert.throws(() => paiseToRupees(99.99), TypeError);
    assert.throws(() => paiseToRupees('9999'), TypeError);
  });
});

describe('the ceiling', () => {
  it('is ten lakh rupees expressed in paise', () => {
    assert.equal(MAX_PAISE, 100000000);
    assert.equal(paiseToRupees(MAX_PAISE), '10,00,000.00');
  });
});
