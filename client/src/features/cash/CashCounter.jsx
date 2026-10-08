import Money, { moneyText } from '../../components/ui/Money.jsx';

import { countedTotal, keyOf, orderedDenominations } from './cashCount.js';

const MAX_COUNT = 10_000;

/**
 * Counts cash by notes and coins. P25 Part F, the one counter used for the
 * opening float, at Day Close and on a cash payment.
 *
 * One row per active denomination, notes then coins, each largest first: a
 * minus, the count (typed straight in, if that is quicker), a plus, and the
 * row's value, every control at least 48px. The running total sits on top in
 * the hero size. `counts` is `{ "NOTE:50000": 2 }`; the parent keeps it.
 */
export default function CashCounter({ denominations, counts, onChange, title = 'Count the cash' }) {
  const rows = orderedDenominations(denominations);
  const set = (denomination, next) => {
    const count = Math.max(0, Math.min(MAX_COUNT, Number.isFinite(next) ? Math.floor(next) : 0));
    onChange({ ...counts, [keyOf(denomination)]: count });
  };

  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-heading">{title}</h3>
        <Money paise={countedTotal(counts, denominations)} size="hero" tabular />
      </div>
      {['NOTE', 'COIN'].map((kind) => {
        const group = rows.filter((denomination) => denomination.kind === kind);
        if (group.length === 0) return null;
        return (
          <fieldset key={kind} className="flex flex-col gap-1">
            <legend className="type-label mb-1 text-muted">{kind === 'NOTE' ? 'Notes' : 'Coins'}</legend>
            {group.map((denomination) => {
              const count = counts[keyOf(denomination)] ?? 0;
              const label = `${kind === 'NOTE' ? 'note' : 'coin'} of ${moneyText(denomination.valueInPaise)}`;
              return (
                <div key={keyOf(denomination)} className="flex min-h-12 items-center gap-2">
                  <span className="type-body w-20 flex-none">
                    <Money paise={denomination.valueInPaise} />
                  </span>
                  <button
                    type="button"
                    aria-label={`One less ${label}`}
                    onClick={() => set(denomination, count - 1)}
                    disabled={count === 0}
                    className="size-12 flex-none rounded-lg border border-line bg-surface type-heading disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_COUNT}
                    aria-label={`How many ${label}`}
                    value={count}
                    onChange={(event) => set(denomination, Number(event.target.value))}
                    className="h-12 w-20 flex-none rounded-lg border border-line bg-surface text-center type-num-tile"
                  />
                  <button
                    type="button"
                    aria-label={`One more ${label}`}
                    onClick={() => set(denomination, count + 1)}
                    className="size-12 flex-none rounded-lg border border-line bg-surface type-heading"
                  >
                    +
                  </button>
                  <span className="type-num-meta ml-auto text-right">
                    <Money paise={denomination.valueInPaise * count} tabular />
                  </span>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </section>
  );
}
