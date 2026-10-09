import NumericKeypad from '../../../components/ui/NumericKeypad.jsx';
import CashCounter from '../../cash/CashCounter.jsx';
import { countedTotal, toCashCount } from '../../cash/cashCount.js';
import { parseRupeesToPaise } from '../../../utils/formatMoney.js';

/**
 * An amount for the cash book, typed on the keypad or counted by notes and
 * coins. P29 Part F. The parent holds `{ byNotes, typed, counts }`; `amountOf`
 * and `bodyOf` turn it into what is shown and what is sent. The server totals
 * a count itself; the total here is only what the person sees while counting.
 */
export const emptyAmount = (byNotes = false) => ({ byNotes, typed: '', counts: {} });

export function amountOf(value, denominations) {
  return value.byNotes ? countedTotal(value.counts, denominations) : parseRupeesToPaise(value.typed);
}

export function bodyOf(value, denominations) {
  return value.byNotes ? { cashCount: toCashCount(value.counts, denominations) } : { amountInPaise: parseRupeesToPaise(value.typed) };
}

export default function AmountOrCount({ value, onChange, denominations, title = 'Amount', allowNotes = true }) {
  return (
    <div className="flex flex-col gap-3">
      {allowNotes && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1" role="group" aria-label="How to enter it">
          {[
            [false, 'Type the amount'],
            [true, 'Count by notes'],
          ].map(([byNotes, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={value.byNotes === byNotes}
              onClick={() => onChange({ ...value, byNotes })}
              className={['type-label min-h-12 rounded-lg', value.byNotes === byNotes ? 'border border-line bg-surface' : 'text-muted'].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {value.byNotes ? (
        <CashCounter title={title} denominations={denominations} counts={value.counts} onChange={(counts) => onChange({ ...value, counts })} />
      ) : (
        <NumericKeypad title={title} prefix="₹" allowDecimal initialValue={value.typed} onChange={(typed) => onChange({ ...value, typed })} hideActions />
      )}
    </div>
  );
}
