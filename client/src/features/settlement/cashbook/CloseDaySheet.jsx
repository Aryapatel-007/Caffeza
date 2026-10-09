import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

import { closeDay } from '../../../api/dayClose.js';
import Input from '../../../components/ui/Input.jsx';
import Money from '../../../components/ui/Money.jsx';
import Sheet, { SheetActions } from '../../../components/ui/Sheet.jsx';
import { formatBusinessDate } from '../../../utils/formatDate.js';
import { errorMessage } from '../../billing/errorCopy.js';
import AmountOrCount, { amountOf, emptyAmount } from './AmountOrCount.jsx';
import { toCashCount } from '../../cash/cashCount.js';
import { paiseToInput, parseRupeesToPaise } from '../../../utils/formatMoney.js';

const DESTINATIONS = [
  ['BANK_DEPOSIT', 'Bank deposit'],
  ['OWNER', 'Given to the owner'],
  ['OTHER', 'Other'],
];

/**
 * Closing the day from the cash book. P29 Part F, API-CONTRACT M16 section 9.4.
 *
 * In this order: count the drawer, by notes or as one amount; keep some for
 * tomorrow, the usual float by default and never more than the count; the
 * rest is taken out, to the bank or the owner. The blind count is unchanged:
 * no expected figure is shown before the count, and a manager is never shown
 * one unless the owner allows it. The server decides everything, including
 * whether a note is needed, and lists what still blocks the close.
 */
export default function CloseDaySheet({ businessDate, denominations, usualFloatInPaise, onCancel, onDone }) {
  const [count, setCount] = useState(emptyAmount(true));
  const [kept, setKept] = useState({ byNotes: false, typed: '', counts: {}, touched: false });
  const [takenOutTo, setTakenOutTo] = useState('BANK_DEPOSIT');
  const [note, setNote] = useState('');
  const [noteRequired, setNoteRequired] = useState(false);

  const counted = amountOf(count, denominations);
  // The usual float, never more than what was counted, until the person types their own.
  const proposed = counted === null ? null : Math.min(usualFloatInPaise ?? 0, counted);
  const keptInPaise = kept.touched ? amountOf(kept, denominations) : proposed;
  const takenOut = counted !== null && keptInPaise !== null ? counted - keptInPaise : null;
  const tooMuch = takenOut !== null && takenOut < 0;

  const close = useMutation({
    mutationFn: () =>
      closeDay({
        businessDate,
        ...(count.byNotes ? { cashCount: toCashCount(count.counts, denominations) } : { countedCashInPaise: parseRupeesToPaise(count.typed) }),
        note: note.trim(),
        ...(kept.touched && kept.byNotes ? { keptForTomorrowCount: toCashCount(kept.counts, denominations) } : { keptForTomorrowInPaise: keptInPaise }),
        ...(takenOut > 0 ? { takenOutTo } : {}),
      }),
    onSuccess: onDone,
    onError: (error) => {
      if (error?.details?.noteRequired || error?.noteRequired) setNoteRequired(true);
    },
  });
  const blockers = close.error?.blockers ?? close.error?.details?.blockers ?? [];

  return (
    <Sheet
      title={`Close ${formatBusinessDate(businessDate)}`}
      subtitle="Count the drawer, keep the float for tomorrow, and say where the rest goes."
      wide
      onCancel={onCancel}
      footer={
        <SheetActions
          onCancel={onCancel}
          confirmLabel={close.isPending ? 'Closing…' : 'Close the day'}
          disabled={counted === null || counted < 0 || keptInPaise === null || tooMuch || (noteRequired && !note.trim()) || close.isPending}
          onConfirm={() => close.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="type-heading">1. Count the drawer</h3>
          <AmountOrCount value={count} onChange={setCount} denominations={denominations} title="Cash counted in the drawer" />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="type-heading">2. Keep for tomorrow</h3>
          <p className="type-caption text-muted">
            The usual float is <Money paise={usualFloatInPaise ?? 0} />. It stays in the drawer and is proposed as tomorrow's opening float.
          </p>
          <AmountOrCount
            key={kept.touched ? 'own' : `proposed-${proposed}`}
            value={kept.touched ? kept : { ...kept, typed: proposed !== null ? paiseToInput(proposed) : '' }}
            onChange={(next) => setKept({ ...next, touched: true })}
            denominations={denominations}
            title="Kept for tomorrow"
          />
          {tooMuch && <p className="type-body text-alert">You cannot keep more than you counted.</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="type-heading">3. The rest is taken out</h3>
          <p className="type-body">
            Taken out at close: <Money paise={takenOut !== null && takenOut > 0 ? takenOut : 0} size="num" />
          </p>
          {takenOut > 0 && (
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Where it goes">
              {DESTINATIONS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={takenOutTo === code}
                  onClick={() => setTakenOutTo(code)}
                  className={['type-label min-h-12 rounded-lg border px-3', takenOutTo === code ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface'].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>

        <Input
          label={noteRequired ? 'Note, required: the count is not what the drawer should hold' : 'Note, optional'}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {blockers.length > 0 && (
          <div className="rounded-lg border border-line border-l-[3px] border-l-alert p-3">
            <p className="type-heading mb-1 text-alert">Sort these out first</p>
            <ul className="type-body flex flex-col gap-1">
              {blockers.map((blocker) => (
                <li key={`${blocker.kind}-${blocker.ref}`}>
                  {blocker.kind === 'OPEN_ORDER' ? (
                    <Link className="text-accent underline underline-offset-4" to={`/orders/${blocker.ref}`}>{blocker.message}</Link>
                  ) : blocker.kind === 'UNPAID_BILL' ? (
                    <Link className="text-accent underline underline-offset-4" to={`/bills/${blocker.ref}`}>{blocker.message}</Link>
                  ) : (
                    blocker.message
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {close.isError && blockers.length === 0 && <p className="type-body text-alert">{errorMessage(close.error)}</p>}
      </div>
    </Sheet>
  );
}
