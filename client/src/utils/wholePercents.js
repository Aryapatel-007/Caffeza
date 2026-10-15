/**
 * Whole percents for a list of amounts that always add up to exactly 100, by
 * the largest remainder method (GLOSSARY section 3): each row gets its whole
 * percent rounded down, and the points left over go one at a time to the rows
 * with the biggest leftover fractions, an earlier row winning a tie.
 *
 * For a bar's caption only. It never changes a figure: the amounts stay the
 * server's. Negative or zero amounts get 0. All zero gives all 0.
 */
export function wholePercents(amounts) {
  const values = amounts.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return values.map(() => 0);
  const exact = values.map((value) => (value * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left === 0) break;
    if (values[index] === 0) continue;
    floors[index] += 1;
    left -= 1;
  }
  return floors;
}
