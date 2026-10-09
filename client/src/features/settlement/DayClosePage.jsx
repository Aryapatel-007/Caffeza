import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import { DotIcon, PrintIcon, TickIcon, TriangleIcon } from '../../components/ui/icons/index.jsx';
import Input from '../../components/ui/Input.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { getDay, getDayPrint, reopenDay } from '../../api/dayClose.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateBefore, businessDateToday, formatBusinessDate } from '../../utils/formatDate.js';
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
    <div className={`flex justify-between gap-3 py-1 ${strong ? 'border-t-2 border-ink' : ''}`}>
      <dt className={strong ? 'type-body font-semibold' : 'type-body text-muted'}>{label}</dt>
      <dd className={`type-num tabular-nums ${strong ? 'font-semibold' : ''} ${tone}`}>{value}</dd>
    </div>
  );
}

function Figures({ day }) {
  const { sales, money, cash, controls } = day.figures;
  return (
    <div className="grid gap-6 rounded-[10px] border border-line bg-surface p-4 sm:grid-cols-2">
      <section>
        <h2 className="type-heading mb-1">Sales</h2>
        <dl>
          <Row label="Bills" value={sales.billCount} />
          <Row label="Covers" value={sales.covers} />
          <Row label="Item total" value={<Money paise={sales.itemTotalInPaise} />} />
          <Row label="Discount" value={<Money paise={sales.discountInPaise} />} />
          <Row label="Net sales" value={<Money paise={sales.netSalesInPaise} />} />
          <Row label="GST" value={<Money paise={sales.gstInPaise} />} />
          <Row label="Round-off" value={<Money paise={sales.roundOffInPaise} />} />
          <Row label="Bill total" value={<Money paise={sales.billTotalInPaise} />} strong />
          <Row label="Average bill" value={<Money paise={sales.averageBillInPaise} />} />
          <Row label="Average per cover" value={<Money paise={sales.averagePerCoverInPaise} />} />
        </dl>
      </section>
      <section>
        <h2 className="type-heading mb-1">Where the bill total went</h2>
        <dl>
          {money.methods.map((row) => (
            <Row key={row.method} label={row.methodName} value={<Money paise={row.amountInPaise} />} />
          ))}
          <Row label="Money in hand" value={<Money paise={money.inHandInPaise} />} />
          <Row label="Platform money" value={<Money paise={money.platformInPaise} />} />
          {money.onHold.map((row) => (
            <Row key={row.accountName} label={`On Hold: ${row.accountName}`} value={<Money paise={row.amountInPaise} />} />
          ))}
          <Row label="Unpaid" value={<Money paise={money.unpaidInPaise} />} />
          <Row label="Total" value={<Money paise={money.totalInPaise} />} strong />
        </dl>
      </section>
      <section>
        <h2 className="type-heading mb-1">
          <Link to={`/cash-book?date=${day.businessDate}`} className="inline-flex min-h-12 items-center underline-offset-4 hover:underline">
            Cash book
          </Link>
        </h2>
        <dl>
          {cash.broughtForward && (
            <Row label={`Brought forward from ${formatBusinessDate(cash.broughtForward.fromDate)}`} value={<Money paise={cash.broughtForward.keptInPaise ?? 0} />} />
          )}
          <Row label="Opening float" value={<Money paise={cash.openingFloatInPaise} />} />
          <Row label="Top-ups" value={<Money paise={cash.paidInInPaise} />} />
          <Row label="Cash from bills" value={<Money paise={cash.cashFromBillsInPaise} />} />
          <Row label="Cash collections" value={<Money paise={cash.cashCollectionsInPaise} />} />
          <Row label="Expenses" value={<Money paise={cash.paidOutInPaise} />} />
          {cash.cashTakenOutInPaise !== undefined && <Row label="Cash taken out" value={<Money paise={cash.cashTakenOutInPaise} />} />}
          {cash.expectedCashInPaise !== undefined && (
            <Row label="Expected cash" value={<Money paise={cash.expectedCashInPaise} />} strong />
          )}
          {day.countedCashInPaise !== null && day.countedCashInPaise !== undefined && (
            <Row label="Counted cash" value={<Money paise={day.countedCashInPaise} />} />
          )}
          {day.differenceInPaise !== null && day.differenceInPaise !== undefined && (
            <Row
              label="Cash difference"
              value={<Money paise={day.differenceInPaise} />}
              tone={day.differenceInPaise < 0 ? 'text-alert' : ''}
            />
          )}
          {day.keptForTomorrowInPaise !== null && day.keptForTomorrowInPaise !== undefined && (
            <>
              <Row label="Kept for tomorrow" value={<Money paise={day.keptForTomorrowInPaise} />} />
              <Row label="Taken out at close" value={<Money paise={day.takenOutAtCloseInPaise ?? 0} />} />
            </>
          )}
        </dl>
      </section>
      <section>
        <h2 className="type-heading mb-1">Controls</h2>
        <dl>
          <Row label={`Discounts (${controls.discounts.count})`} value={<Money paise={controls.discounts.totalInPaise} />} />
          <Row label={`No Charge (${controls.noCharge.count})`} value={<Money paise={controls.noCharge.valueInPaise} />} />
          <Row label={`Items cancelled (${controls.cancelledItems.count})`} value={<Money paise={controls.cancelledItems.valueInPaise} />} />
          <Row label="Wasted value" value={<Money paise={controls.cancelledItems.wastedValueInPaise} />} />
          <Row label={`Orders cancelled (${controls.cancelledOrders.count})`} value={<Money paise={controls.cancelledOrders.valueInPaise} />} />
          <Row label={`Voided bills (${controls.voidedBills.count})`} value={<Money paise={controls.voidedBills.valueInPaise} />} />
        </dl>
      </section>
    </div>
  );
}

function Checks({ checks }) {
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((check) => {
        const state = check.passed ? 'ok' : check.severity === 'ERROR' ? 'alert' : 'open';
        const Icon = check.passed ? TickIcon : check.severity === 'ERROR' ? TriangleIcon : DotIcon;
        return (
          <li key={check.id} className={`type-body flex items-start gap-2 ${STATE_TEXT[state]}`}>
            <Icon className="mt-1" />
            <span className={check.passed ? 'text-ink' : ''}>{check.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

const STATE_TEXT = { ok: 'text-ok', alert: 'text-alert', open: 'text-open' };

export default function DayClosePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = businessDateToday();
  const businessDate = params.get('date') ?? businessDateBefore(today);
  const isOwner = user?.role === ROLES.OWNER;

  const [reopenReason, setReopenReason] = useState('');
  const [toast, setToast] = useState(null);
  const [device] = useDeviceSettings();

  const query = useQuery({ queryKey: ['day-close', businessDate], queryFn: () => getDay(businessDate) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['day-close'] });

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
      const { text } = await getDayPrint(businessDate, charactersFor(device.printer));
      await printText(text, device.printer);
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    }
  };

  const day = query.data;

  return (
    <main className="v2 text-ink min-h-full bg-ground">
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-title">Day Close</h1>
            <p className="type-caption text-muted">Count the drawer and lock the day.</p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              label="Business date"
              type="date"
              max={today}
              value={businessDate}
              onChange={(event) => event.target.value && setParams({ date: event.target.value })}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Working out the day" />}
        {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}

        {day && (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="type-heading">{formatBusinessDate(businessDate)}</span>
              <StateChip
                state={day.isClosed ? 'ok' : 'open'}
                word={day.isClosed ? 'Closed' : day.status === 'REOPENED' ? 'Reopened, still open' : 'Still open'}
              />
            </p>

            {!day.isClosed && day.blockers.length > 0 && (
              <section className="rounded-[10px] border border-line border-l-[3px] border-l-alert bg-surface p-4">
                <h2 className="type-heading mb-2 flex items-center gap-2 text-alert">
                  <TriangleIcon />
                  Sort these out first
                </h2>
                <ul className="type-body flex flex-col gap-1">
                  {day.blockers.map((blocker) => (
                    <li key={`${blocker.kind}-${blocker.ref}`}>
                      {blocker.kind === 'OPEN_ORDER' && <Link className="text-accent underline underline-offset-4" to={`/orders/${blocker.ref}`}>{blocker.message}</Link>}
                      {blocker.kind === 'UNPAID_BILL' && <Link className="text-accent underline underline-offset-4" to={`/bills/${blocker.ref}`}>{blocker.message}</Link>}
                      {blocker.kind === 'CHECK' && <span className="text-alert">{blocker.message}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* P29 Part F. The count, the cash kept for tomorrow and the rest taken out are the cash book's last step. */}
            {!day.isClosed && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface p-4">
                <p className="type-body">Count the drawer, keep the float for tomorrow, and close, in the cash book.</p>
                <Link
                  to={`/cash-book?date=${businessDate}&close=1`}
                  className="type-button inline-flex min-h-12 items-center rounded-lg bg-accent px-4 text-on-accent hover:brightness-110"
                >
                  Count and close {formatBusinessDate(businessDate)}
                </Link>
              </section>
            )}

            {day.isClosed && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={print}>
                  <PrintIcon />
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
                      variant="secondary"
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
              <h2 className="type-heading mb-2">Checks</h2>
              <Checks checks={day.checks} />
            </section>
          </>
        )}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
