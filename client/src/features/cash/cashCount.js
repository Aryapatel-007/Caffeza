/**
 * Counting cash by notes and coins, on the client. P25 Part F.
 *
 * Pure helpers. The server always works out the total itself
 * (`sumCashCount` in server/utils/money.js); the total here is only what the
 * person sees while counting.
 */

export const keyOf = (denomination) => `${denomination.kind}:${denomination.valueInPaise}`;

/** The active notes then coins, each largest first. */
export function orderedDenominations(denominations = []) {
  return [...denominations].sort((a, b) => (a.kind === b.kind ? b.valueInPaise - a.valueInPaise : a.kind === 'NOTE' ? -1 : 1));
}

/** `{ "NOTE:50000": 2 }` to the request's `cashCount`, leaving out zeros. */
export function toCashCount(counts, denominations) {
  return orderedDenominations(denominations)
    .filter((denomination) => (counts[keyOf(denomination)] ?? 0) > 0)
    .map((denomination) => ({ valueInPaise: denomination.valueInPaise, kind: denomination.kind, count: counts[keyOf(denomination)] }));
}

/** What the person has counted so far, in paise. */
export function countedTotal(counts, denominations) {
  return toCashCount(counts, denominations).reduce((total, row) => total + row.valueInPaise * row.count, 0);
}

/**
 * Notes and coins to hand back as change, largest first, from the active
 * denominations. A suggestion: whatever cannot be made exactly is left as the
 * `remainderInPaise`.
 */
export function suggestChange(changeInPaise, denominations) {
  let left = changeInPaise;
  const give = [];
  for (const denomination of orderedDenominations(denominations).sort((a, b) => b.valueInPaise - a.valueInPaise)) {
    const count = Math.floor(left / denomination.valueInPaise);
    if (count > 0) {
      give.push({ ...denomination, count });
      left -= count * denomination.valueInPaise;
    }
  }
  return { give, remainderInPaise: left };
}
