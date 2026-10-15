import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { TriangleIcon } from '../../components/ui/icons/index.jsx';
import Input from '../../components/ui/Input.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { emailDay, getCashBook, getDay, getDayMessage } from '../../api/dayClose.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateToday, formatBusinessDate, formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from '../billing/errorCopy.js';
import CashFlow from './cashbook/CashFlow.jsx';
import CloseDaySheet from './cashbook/CloseDaySheet.jsx';

const STEPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'cash', label: 'Cash' },
  { key: 'close', label: 'Close' },
];

const ORDER_TYPE_WORDS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const PLATFORM_WORDS = { SWIGGY: 'Swiggy', ZOMATO: 'Zomato' };

/**
 * Day End. P44, OWNER and MANAGER.
 *
 * The day in three steps, as on PetPooja, which Z Chaat's manager knew:
 * Overview (cards, then the details), Cash (the cash book's sum), Close (the
 * cash book's own close). Every figure is GET /day-close/:date's, the same as
 * Day Close and R2; this page only lays them out. The day-end message sits
 * under every step, to copy or email.
 */
export default function DayEndPage() {
  const [params, setParams] = useSearchParams();
  const today = businessDateToday();
  const businessDate = params.get('date') ?? today;
  const step = STEPS.some((entry) => entry.key === params.get('step')) ? params.get('step') : 'overview';
  const go = (next) => setParams({ date: businessDate, step: next });

  const query = useQuery({ queryKey: ['day-close', businessDate], queryFn: () => getDay(businessDate) });
  const day = query.data;

  return (
    <main className="v2 min-h-full bg-ground text-ink">
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-title">Day End</h1>
            <p className="type-caption text-muted">
              {formatBusinessDate(businessDate)}
              {day && (day.isClosed ? ' · closed' : ' · open')}
            </p>
          </div>
          <Input
            label="Business date"
            type="date"
            max={today}
            value={businessDate}
            onChange={(event) => event.target.value && setParams({ date: event.target.value, step })}
          />
        </div>
        <nav aria-label="Day End steps" className="mx-auto mt-4 flex max-w-5xl gap-1 border-b border-line" role="tablist">
          {STEPS.map((entry, index) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={step === entry.key}
              onClick={() => go(entry.key)}
              className={[
                'type-label min-h-12 border-b-2 px-4',
                step === entry.key ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
              ].join(' ')}
            >
              <span className="type-num-meta mr-1">{index + 1}</span>
              {entry.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6">
        {query.isPending && <Spinner label="Working out the day" />}
        {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}
        {day && step === 'overview' && <Overview day={day} />}
        {day && step === 'cash' && <CashStep businessDate={businessDate} />}
        {day && step === 'close' && <CloseStep day={day} businessDate={businessDate} />}
        {day && <DayEndMessage businessDate={businessDate} />}
        {day && step !== 'close' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => go(STEPS[STEPS.findIndex((entry) => entry.key === step) + 1].key)}
              className="type-button min-h-12 rounded-lg bg-accent px-6 text-on-accent hover:brightness-110"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ title, amountInPaise, count, countLabel = 'Bills', note = null }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-4">
      <h3 className="type-label text-muted">{title}</h3>
      <Money paise={amountInPaise} size="num" className="type-num-fit" />
      {count !== undefined && (
        <p className="type-caption text-muted">
          {countLabel}: <span className="type-num-meta text-ink">{count}</span>
        </p>
      )}
      {note && <p className="type-caption text-muted">{note}</p>}
    </div>
  );
}

function Row({ label, children, strong = false }) {
  return (
    <div className={['flex items-baseline justify-between gap-3 py-2', strong ? 'border-t-2 border-ink font-semibold' : 'border-b border-line'].join(' ')}>
      <dt className={strong ? 'type-body' : 'type-body text-muted'}>{label}</dt>
      <dd className="type-num tabular-nums">{children}</dd>
    </div>
  );
}

function Overview({ day }) {
  const { sales, money, controls, orderTypes } = day.figures;
  return (
    <>
      <section aria-label="Day at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card title="Bills" amountInPaise={sales.billTotalInPaise} count={sales.billCount} />
        {/* P56. Whole cancellations only. */}
        <Card
          title="Orders cancelled"
          amountInPaise={controls.cancelledOrders?.valueInPaise ?? 0}
          count={controls.cancelledOrders?.count ?? 0}
          countLabel="Orders"
        />
        <Card title="No Charge" amountInPaise={controls.noCharge?.valueInPaise ?? 0} count={controls.noCharge?.count ?? 0} countLabel="Orders" />
        <Card title="Voided bills" amountInPaise={controls.voidedBills?.valueInPaise ?? 0} count={controls.voidedBills?.count ?? 0} />
        <Card title="Discounts" amountInPaise={controls.discounts?.totalInPaise ?? 0} count={controls.discounts?.count ?? 0} />
        <Card
          title="On Hold"
          amountInPaise={money.onHoldInPaise ?? 0}
          count={money.onHold?.length ?? 0}
          countLabel="Accounts"
          note={money.unpaidBillCount ? `and ${money.unpaidBillCount} unpaid ${money.unpaidBillCount === 1 ? 'bill' : 'bills'}` : null}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[10px] border border-line bg-surface p-4">
          <h2 className="type-heading mb-1">Sales</h2>
          <dl>
            <Row label="Item total"><Money paise={sales.itemTotalInPaise} /></Row>
            <Row label="Discount"><Money paise={sales.discountInPaise} /></Row>
            <Row label="Net sales"><Money paise={sales.netSalesInPaise} /></Row>
            <Row label="CGST"><Money paise={sales.cgstInPaise} /></Row>
            <Row label="SGST"><Money paise={sales.sgstInPaise} /></Row>
            <Row label="Round-off"><Money paise={sales.roundOffInPaise} /></Row>
            <Row label="Bill total" strong><Money paise={sales.billTotalInPaise} /></Row>
          </dl>
          <h2 className="type-heading mb-1 mt-6">How the day went</h2>
          <dl>
            <Row label="Covers">{sales.covers}</Row>
            <Row label="Average per cover"><Money paise={sales.averagePerCoverInPaise} /></Row>
            <Row label="Average bill"><Money paise={sales.averageBillInPaise} /></Row>
          </dl>
        </section>

        <section className="rounded-[10px] border border-line bg-surface p-4">
          <h2 className="type-heading mb-1">Payment methods</h2>
          <dl>
            {money.methods.map((row) => (
              <Row key={row.method} label={row.methodName}><Money paise={row.amountInPaise} /></Row>
            ))}
            {money.onHold.map((row) => (
              <Row key={row.accountName} label={`On Hold: ${row.accountName}`}><Money paise={row.amountInPaise} /></Row>
            ))}
            <Row label="Unpaid"><Money paise={money.unpaidInPaise} /></Row>
            <Row label="Total" strong><Money paise={money.totalInPaise} /></Row>
          </dl>
          <h2 className="type-heading mb-1 mt-6">Order types</h2>
          <dl>
            {(orderTypes ?? []).map((row) => (
              <Row key={`${row.orderType}-${row.platformCode ?? ''}`} label={`${ORDER_TYPE_WORDS[row.orderType] ?? row.orderType}${row.platformCode ? `, ${PLATFORM_WORDS[row.platformCode] ?? row.platformCode}` : ''} · ${row.billCount} ${row.billCount === 1 ? 'bill' : 'bills'}`}>
                <Money paise={row.billTotalInPaise} />
              </Row>
            ))}
            {(orderTypes ?? []).length === 0 && <p className="type-body py-2 text-muted">No bills yet.</p>}
          </dl>
        </section>
      </div>
    </>
  );
}

function CashStep({ businessDate }) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['cash-book', businessDate], queryFn: () => getCashBook(businessDate) });
  if (query.isPending) return <Spinner label="Reading the cash book" />;
  if (query.isError) return <p className="type-body text-alert">{errorMessage(query.error)}</p>;
  return (
    <section aria-label="Cash" className="flex flex-col gap-3">
      <p className="type-body text-muted">What came into the drawer and what went out. Tap a box to see or add its entries in the cash book.</p>
      <CashFlow book={query.data} onOpen={() => navigate(`/cash-book?date=${businessDate}`)} />
      <Link to={`/cash-book?date=${businessDate}`} className="type-label inline-flex min-h-12 items-center self-start text-accent underline-offset-4 hover:underline">
        Open the cash book
      </Link>
    </section>
  );
}

function CloseStep({ day, businessDate }) {
  const queryClient = useQueryClient();
  const { features } = useAuth();
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState(null);

  if (day.isClosed) {
    return (
      <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-4">
        <StateChip state="ok" word="Closed" />
        <p className="type-body">
          Closed at {day.closedAt ? formatTimeIst(day.closedAt) : '—'}. Counted <Money paise={day.countedCashInPaise ?? 0} />
          {day.keptForTomorrowInPaise !== null && day.keptForTomorrowInPaise !== undefined && (
            <>
              , kept for tomorrow <Money paise={day.keptForTomorrowInPaise} />
            </>
          )}
          .
        </p>
        {day.dayEndEmail?.sentAt && <p className="type-caption text-muted">Day-end email sent to {day.dayEndEmail.to.join(', ')}.</p>}
        {day.dayEndEmail?.error && <p className="type-caption text-alert">The day-end email did not go: {day.dayEndEmail.error}</p>}
        <Link to={`/day-close?date=${businessDate}`} className="type-label inline-flex min-h-12 items-center self-start text-accent underline-offset-4 hover:underline">
          Day Close history and reopening
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {day.blockers.length > 0 && (
        <div className="rounded-[10px] border border-line border-l-[3px] border-l-alert bg-surface p-4">
          <h2 className="type-heading mb-2 flex items-center gap-2 text-alert">
            <TriangleIcon />
            Sort these out first
          </h2>
          <ul className="type-body flex flex-col gap-1">
            {day.blockers.map((blocker) => (
              <li key={`${blocker.kind}-${blocker.ref}`}>
                {blocker.kind === 'OPEN_ORDER' && <Link className="text-accent underline underline-offset-4" to={`/orders/${blocker.ref}`}>{blocker.message}</Link>}
                {blocker.kind === 'UNPAID_BILL' && <Link className="text-accent underline underline-offset-4" to={`/bills/${blocker.ref}`}>{blocker.message}</Link>}
                {!['OPEN_ORDER', 'UNPAID_BILL'].includes(blocker.kind) && <span className="text-alert">{blocker.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="type-body text-muted">Count the drawer, say how much stays for tomorrow, and close the day. The day-end message is emailed once it is closed.</p>
      <button
        type="button"
        disabled={day.blockers.length > 0}
        onClick={() => setClosing(true)}
        className="type-button min-h-14 self-start rounded-lg bg-accent px-6 text-on-accent hover:brightness-110 disabled:opacity-50"
      >
        Count and close the day
      </button>
      {closing && (
        <CloseDaySheet
          businessDate={businessDate}
          denominations={features?.cash?.denominations ?? []}
          usualFloatInPaise={features?.cash?.usualFloatInPaise ?? 200000}
          onCancel={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            queryClient.invalidateQueries({ queryKey: ['day-close'] });
            queryClient.invalidateQueries({ queryKey: ['day-end-message'] });
            setToast({ tone: 'success', message: `${formatBusinessDate(businessDate)} is closed.` });
          }}
        />
      )}
      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </section>
  );
}

/** P44. The day-end message: the text, Copy for WhatsApp, and Email this report. */
function DayEndMessage({ businessDate }) {
  const query = useQuery({ queryKey: ['day-end-message', businessDate], queryFn: () => getDayMessage(businessDate) });
  const [toast, setToast] = useState(null);
  const send = useMutation({
    mutationFn: () => emailDay(businessDate),
    onSuccess: ({ sentTo }) => setToast({ tone: 'success', message: `Emailed to ${sentTo.join(', ')}.` }),
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(query.data.text);
      setToast({ tone: 'success', message: 'Copied. Paste it into WhatsApp.' });
    } catch {
      setToast({ tone: 'error', message: 'Could not copy on this device. Select the text and copy it.' });
    }
  };

  return (
    <section aria-label="Day-end message" className="rounded-[10px] border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-heading">Day-end message</h2>
        <div className="flex gap-2">
          <button type="button" disabled={!query.data} onClick={copy} className="type-button min-h-12 rounded-lg border border-ink px-4 hover:bg-sunken disabled:opacity-50">
            Copy
          </button>
          <button
            type="button"
            disabled={!query.data || send.isPending}
            onClick={() => send.mutate()}
            className="type-button min-h-12 rounded-lg bg-accent px-4 text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {send.isPending ? 'Sending…' : 'Email this report'}
          </button>
        </div>
      </div>
      {query.isPending && <Spinner label="Writing the message" />}
      {query.isError && <p className="type-body text-alert">{errorMessage(query.error)}</p>}
      {query.data && <pre className="type-dense whitespace-pre-wrap rounded-lg bg-sunken p-3">{query.data.text}</pre>}
      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </section>
  );
}
