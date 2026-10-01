import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { closeDay, getDay, getDayPrint, reopenDay } from '../../api/dayClose.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateBefore, businessDateToday, formatBusinessDate } from '../../utils/formatDate.js';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { errorMessage } from '../billing/errorCopy.js';
import { charactersFor, printText } from '../printing/printText.js';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import { ROLES } from '../users/roles.js';

/**
 * Day Close. P10. OWNER and MANAGER.
 *
 * Pick the business date, see what blocks the close, count the drawer, close.
 * A manager is never shown what the drawer should hold: the server leaves it
 * out of every response, and this screen draws only what it is sent. The owner
 * sees the expected cash and the difference, and can reopen a closed day.
 */
function Row({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-steel">{label}</dt>
      <dd className={`font-mono ${strong ? 'font-semibold text-ink' : ''} ${tone}`}>{value}</dd>
    </div>
  );
}

function Figures({ day }) {
  const { sales, money, cash, controls } = day.figures;
  return (
    <div className="grid gap-6 text-[13px] leading-[18px] sm:grid-cols-2">
      <section>
        <h2 className="mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">Sales</h2>
        <dl>
          <Row label="Bills" value={sales.billCount} />
          <Row label="Covers" value={sales.covers} />
          <Row label="Item total" value={formatPaise(sales.itemTotalInPaise)} />
          <Row label="Discount" value={formatPaise(sales.discountInPaise)} />
          <Row label="Net sales" value={formatPaise(sales.netSalesInPaise)} />
          <Row label="GST" value={formatPaise(sales.gstInPaise)} />
          <Row label="Round-off" value={formatPaise(sales.roundOffInPaise)} />
          <Row label="Bill total" value={formatPaise(sales.billTotalInPaise)} strong />
          <Row label="Average bill" value={formatPaise(sales.averageBillInPaise)} />
          <Row label="Average per cover" value={formatPaise(sales.averagePerCoverInPaise)} />
        </dl>
      </section>
      <section>
        <h2 className="mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">Where the bill total went</h2>
        <dl>
          {money.methods.map((row) => (
            <Row key={row.method} label={row.methodName} value={formatPaise(row.amountInPaise)} />
          ))}
          <Row label="Money in hand" value={formatPaise(money.inHandInPaise)} />
          <Row label="Platform money" value={formatPaise(money.platformInPaise)} />
          {money.onHold.map((row) => (
            <Row key={row.accountName} label={`On Hold: ${row.accountName}`} value={formatPaise(row.amountInPaise)} />
          ))}
          <Row label="Unpaid" value={formatPaise(money.unpaidInPaise)} />
          <Row label="Total" value={formatPaise(money.totalInPaise)} strong />
        </dl>
      </section>
      <section>
        <h2 className="mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">Cash drawer</h2>
        <dl>
          <Row label="Opening float" value={formatPaise(cash.openingFloatInPaise)} />
          <Row label="Cash from bills" value={formatPaise(cash.cashFromBillsInPaise)} />
          <Row label="Cash collections" value={formatPaise(cash.cashCollectionsInPaise)} />
          <Row label="Paid in" value={formatPaise(cash.paidInInPaise)} />
          <Row label="Paid out" value={formatPaise(cash.paidOutInPaise)} />
          {cash.expectedCashInPaise !== undefined && (
            <Row label="Expected cash" value={formatPaise(cash.expectedCashInPaise)} strong />
          )}
          {day.countedCashInPaise !== null && day.countedCashInPaise !== undefined && (
            <Row label="Counted cash" value={formatPaise(day.countedCashInPaise)} />
          )}
          {day.differenceInPaise !== null && day.differenceInPaise !== undefined && (
            <Row
              label="Cash difference"
              value={formatPaise(day.differenceInPaise)}
              tone={day.differenceInPaise < 0 ? 'text-mirch' : ''}
            />
          )}
        </dl>
      </section>
      <section>
        <h2 className="mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">Controls</h2>
        <dl>
          <Row label={`Discounts (${controls.discounts.count})`} value={formatPaise(controls.discounts.totalInPaise)} />
          <Row label={`No Charge (${controls.noCharge.count})`} value={formatPaise(controls.noCharge.valueInPaise)} />
          <Row label={`Items cancelled (${controls.cancelledItems.count})`} value={formatPaise(controls.cancelledItems.valueInPaise)} />
          <Row label="Wasted value" value={formatPaise(controls.cancelledItems.wastedValueInPaise)} />
          <Row label={`Orders cancelled (${controls.cancelledOrders.count})`} value={formatPaise(controls.cancelledOrders.valueInPaise)} />
          <Row label={`Voided bills (${controls.voidedBills.count})`} value={formatPaise(controls.voidedBills.valueInPaise)} />
        </dl>
      </section>
    </div>
  );
}

function Checks({ checks }) {
  return (
    <ul className="grid gap-1 text-[13px] leading-[18px]">
      {checks.map((check) => (
        <li
          key={check.id}
          className={[
            'rounded-lg border-2 px-3 py-2',
            check.passed ? 'border-patta/50' : check.severity === 'ERROR' ? 'border-mirch text-mirch' : 'border-ink/40',
          ].join(' ')}
        >
          {check.passed ? '✓ ' : check.severity === 'ERROR' ? '✕ ' : '! '}
          {check.message}
        </li>
      ))}
    </ul>
  );
}

export default function DayClosePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = businessDateToday();
  const businessDate = params.get('date') ?? businessDateBefore(today);
  const isOwner = user?.role === ROLES.OWNER;

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [noteRequired, setNoteRequired] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [toast, setToast] = useState(null);
  const [device] = useDeviceSettings();

  const query = useQuery({ queryKey: ['day-close', businessDate], queryFn: () => getDay(businessDate) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['day-close'] });

  const close = useMutation({
    mutationFn: () => closeDay({ businessDate, countedCashInPaise: parseRupeesToPaise(counted), note: note.trim() }),
    onSuccess: () => {
      setCounted('');
      setNote('');
      setNoteRequired(false);
      refresh();
      setToast({ tone: 'success', message: `${formatBusinessDate(businessDate)} is closed.` });
    },
    onError: (error) => {
      if (error?.details?.noteRequired || error?.noteRequired) setNoteRequired(true);
      setToast({ tone: 'error', message: errorMessage(error) });
    },
  });

  const reopen = useMutation({
    mutationFn: () => reopenDay(businessDate, reopenReason.trim()),
    onSuccess: () => {
      setReopenReason('');
      refresh();
      setToast({ tone: 'success', message: `${formatBusinessDate(businessDate)} is open again.` });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const print = async () => {
    try {
      const { text } = await getDayPrint(businessDate, charactersFor(device.paperMm));
      await printText(text, device.paperMm);
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    }
  };

  const day = query.data;
  const countedInPaise = parseRupeesToPaise(counted);

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Day Close</h1>
            <p className="text-[13px] leading-[18px] text-steel">Count the drawer and lock the day.</p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              label="Business date"
              type="date"
              max={today}
              value={businessDate}
              onChange={(event) => event.target.value && setParams({ date: event.target.value })}
            />
            <Link to="/dashboard" className="text-[13px] font-medium text-steel underline">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Working out the day" />}
        {query.isError && <p className="text-[15px] text-mirch">{errorMessage(query.error)}</p>}

        {day && (
          <>
            <p className="text-[15px] font-semibold leading-6">
              {formatBusinessDate(businessDate)}:{' '}
              {day.isClosed ? 'closed' : day.status === 'REOPENED' ? 'reopened, still open' : 'still open'}
            </p>

            {!day.isClosed && day.blockers.length > 0 && (
              <section className="rounded-xl border-2 border-mirch/60 p-3">
                <h2 className="mb-2 text-[15px] font-semibold">Sort these out first</h2>
                <ul className="grid gap-1 text-[13px] leading-[18px]">
                  {day.blockers.map((blocker) => (
                    <li key={`${blocker.kind}-${blocker.ref}`}>
                      {blocker.kind === 'OPEN_ORDER' && <Link className="underline" to={`/orders/${blocker.ref}`}>{blocker.message}</Link>}
                      {blocker.kind === 'UNPAID_BILL' && <Link className="underline" to={`/bills/${blocker.ref}`}>{blocker.message}</Link>}
                      {blocker.kind === 'CHECK' && <span className="text-mirch">{blocker.message}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!day.isClosed && (
              <section className="grid gap-3 rounded-xl border border-black/5 shadow-card p-3">
                <Input
                  label="Cash counted in the drawer"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                />
                <Input
                  label={noteRequired ? 'Note, required: the count is not what the drawer should hold' : 'Note, optional'}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div>
                  <Button
                    type="button"
                    disabled={countedInPaise === null || countedInPaise < 0 || (noteRequired && !note.trim())}
                    isLoading={close.isPending}
                    onClick={() => close.mutate()}
                  >
                    Close {formatBusinessDate(businessDate)}
                  </Button>
                </div>
              </section>
            )}

            {day.isClosed && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={print}>
                  Print
                </Button>
                {isOwner && (
                  <span className="flex flex-wrap items-end gap-2">
                    <Input
                      label="Reason to reopen"
                      maxLength={200}
                      value={reopenReason}
                      onChange={(event) => setReopenReason(event.target.value)}
                    />
                    <Button
                      type="button"
                      disabled={!reopenReason.trim()}
                      isLoading={reopen.isPending}
                      onClick={() => reopen.mutate()}
                    >
                      Reopen
                    </Button>
                  </span>
                )}
              </div>
            )}

            {(day.isClosed || isOwner) && <Figures day={day} />}
            <section>
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">Checks</h2>
              <Checks checks={day.checks} />
            </section>
          </>
        )}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
