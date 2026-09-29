/**
 * Unit conversion tests. Before any deduction code, same rule as tax.test.js
 * before any billing controller: CONVENTIONS section 13 makes quiet-bug-costs-
 * a-client-money logic the one place with mandatory automated tests, and a
 * wrong conversion here is exactly that.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baseToPurchaseDisplay, purchaseToBaseInteger } from '../utils/units.js';

describe('purchaseToBaseInteger', () => {
  it('multiplies a whole purchase quantity exactly', () => {
    assert.equal(purchaseToBaseInteger('2', 1000), 2000, '2 kg of paneer, base G');
    assert.equal(purchaseToBaseInteger('1', 1), 1, 'already in the base unit');
    assert.equal(purchaseToBaseInteger(5, 12), 60, '5 dozen, base PIECE, unitsPerBase 12');
  });

  it('handles a decimal purchase quantity exactly', () => {
    assert.equal(purchaseToBaseInteger('0.5', 1000), 500);
    assert.equal(purchaseToBaseInteger('1.234', 1000), 1234);
    assert.equal(purchaseToBaseInteger('2.5', 12), 30, '2.5 dozen is 30 pieces exactly');
  });

  it('is exact for a unitsPerBase that is not a power of ten', () => {
    /**
     * THE FACTOR-OF-1000 BUG, generalised. money.js's rupeesToPaise can chop
     * a decimal string at two digits because PAISE_PER_RUPEE is always 100.
     * unitsPerBase is not always a power of ten -- a "dozen" is 12 -- so this
     * function has to be exact for an arbitrary ratio, not just a decimal one.
     */
    assert.equal(purchaseToBaseInteger('7', 453), 3171);
    assert.equal(purchaseToBaseInteger('0.001', 453), 0, 'rounds down: 0.453 rounds to 0');
    assert.equal(purchaseToBaseInteger('0.002', 453), 1, 'rounds up: 0.906 rounds to 1');
  });

  it('rounds half away from zero on precision the base unit cannot represent', () => {
    // 1.2345 * 1000 = 1234.5, which rounds up per the project-wide rule.
    assert.equal(purchaseToBaseInteger('1.2345', 1000), 1235);
    assert.equal(purchaseToBaseInteger('1.2344', 1000), 1234);
  });

  it('carries the sign through, for a RECOUNT correction', () => {
    assert.equal(purchaseToBaseInteger('-0.5', 1000), -500);
  });

  it('refuses a value that is not a plain decimal', () => {
    for (const bad of ['abc', '', '1.2.3', '1,000', 'NaN', '1e3', null, undefined, {}]) {
      assert.throws(
        () => purchaseToBaseInteger(bad, 1000),
        TypeError,
        `${JSON.stringify(bad)} should be refused`,
      );
    }
  });

  it('refuses a unitsPerBase that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, 'abc']) {
      assert.throws(() => purchaseToBaseInteger('1', bad), TypeError);
    }
  });
});

describe('baseToPurchaseDisplay', () => {
  it('formats an exact fraction of the purchase unit', () => {
    assert.equal(baseToPurchaseDisplay(2500, 1000), '2.5');
    assert.equal(baseToPurchaseDisplay(150, 1000), '0.15');
    assert.equal(baseToPurchaseDisplay(7, 1), '7');
  });

  it('trims trailing zeros rather than padding every value to three places', () => {
    assert.equal(baseToPurchaseDisplay(2000, 1000), '2');
    assert.equal(baseToPurchaseDisplay(0, 1000), '0');
  });

  it('is a display label, and its own round trip is stable', () => {
    // Not claiming baseToPurchaseDisplay and purchaseToBaseInteger are exact
    // inverses at every precision -- decimalPlaces caps the display at three
    // digits on purpose -- only that a round number stays round.
    const base = purchaseToBaseInteger('4.5', 200);
    assert.equal(baseToPurchaseDisplay(base, 200), '4.5');
  });

  it('carries the sign for a negative result', () => {
    assert.equal(baseToPurchaseDisplay(-500, 1000), '-0.5');
  });

  it('refuses a non-integer base quantity', () => {
    assert.throws(() => baseToPurchaseDisplay(2.5, 1000), TypeError);
  });
});
