/**
 * Bill numbers. Sequential per restaurant, branch and financial year, and
 * never reused.
 *
 * This exists as its own file rather than as another function in
 * counterService.js because the two have opposite guarantees, and putting them
 * side by side is how somebody eventually calls the wrong one.
 *
 * counterService.nextNumber reserves a number and lets the caller write the
 * document afterwards. If that write fails the number is spent and the sequence
 * has a hole. models/Counter.js says in as many words that this is fine for an
 * order or a kitchen ticket and not fine for a bill.
 *
 * So this reserves the number INSIDE the caller's transaction. Both the counter
 * increment and the bill insert commit together or neither does, and an aborted
 * insert rolls the counter back with it. That is the whole gap-free guarantee
 * and it is the reason a session is a required argument rather than an option.
 */
import { Counter, COUNTER_NAMES } from '../models/Counter.js';
import { TransactionRequiredError } from '../utils/errors.js';
import { financialYearFor } from '../utils/time.js';

/** 2026-27/000148. Zero-padded so numbers sort as strings and read as a series. */
const SEQUENCE_PAD = 6;

export function formatBillNumber(financialYear, sequence) {
  return `${financialYear}/${String(sequence).padStart(SEQUENCE_PAD, '0')}`;
}

/**
 * Reserves the next bill number, inside the given transaction.
 *
 * `session` is required and must be a real transaction session. Passing null
 * throws rather than quietly falling back, because a bill number allocated
 * outside a transaction carries none of the guarantee this function exists to
 * provide, and a silent fallback in development is how the gappy version
 * reaches production.
 *
 * Returns `{ billNumber, financialYear, billSequence }`.
 */
export async function reserveBillNumber({ restaurantId, branchId, at }, session) {
  if (!restaurantId || !branchId) {
    throw new Error('reserveBillNumber() needs a restaurantId and a branchId.');
  }
  if (!session) {
    throw new TransactionRequiredError();
  }

  const financialYear = financialYearFor(at);

  const counter = await Counter.findOneAndUpdate(
    { restaurantId, branchId, name: COUNTER_NAMES.BILL, scope: financialYear },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session },
  );

  return {
    billNumber: formatBillNumber(financialYear, counter.value),
    financialYear,
    billSequence: counter.value,
  };
}

export default { formatBillNumber, reserveBillNumber };
