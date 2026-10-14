import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getReport } from '../../api/reportsV2.js';
import { useLiveInterval } from '../../api/live.js';
import Columns from '../../components/charts/Columns.jsx';
import BalanceSeal from '../../components/ui/BalanceSeal.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Money, { compactMoneyText, moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { DotIcon } from '../../components/ui/icons/index.jsx';
import { businessDateToday, formatBusinessDate, formatTimeIst } from '../../utils/formatDate.js';
import { drillHref } from '../reports/catalog.js';
import { hourLabel } from '../reports/formatReport.js';
import UnclosedDayWarning from '../settlement/UnclosedDayWarning.jsx';

/**
 * P51. The owner's home: today at a glance, one column, phone first.
 *
 * Every figure comes from a report the owner can already open, so this screen
 * adds nothing up: R1 Today for where the money went and the time the figures
 * run to, R2 Day Close for the sales, order types, controls and checks, and R4
 * for the hours. Bars and columns are one colour, `ink`; their length is the
 * figure, and colour never stands for a category (DESIGN-SYSTEM rules 1, 9).
 */
const REFRESH_MS = 60_000;

function Card({ title, aside = null, children, className = '' }) {
  return (
    <section className={`rounded-[10px] border border-line bg-surface p-4 ${className}`}>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="type-heading">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** A row with its figure and a bar in proportion to the largest row: a list, not a chart. */
function BarRows({ rows, emptyMessage }) {
  if (rows.length === 0) return <p className="type-caption text-muted">{emptyMessage}</p>;
  const largest = Math.max(0, ...rows.map((row) => Math.max(0, row.amountInPaise ?? 0)));
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const href = drillHref(row.drill);
        const width = largest > 0 ? `${(Math.max(0, row.amountInPaise) / largest) * 100}%` : '0%';
        const label = (
          <span className={`type-body flex min-w-0 items-center gap-2 ${row.warn ? 'text-open' : ''}`}>
            {row.warn && <DotIcon aria-hidden="true" />}
            <span className="truncate">{row.label}</span>
            {row.note && <span className="type-caption text-muted">({row.note})</span>}
          </span>
        );
        return (
          <li key={row.label} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              {href ? (
                <Link to={href} className="min-w-0 underline-offset-2 hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
              <Money paise={row.amountInPaise} size="num" tabular className={row.warn ? 'text-open' : ''} />
            </div>
            <div className="mt-1 h-2 rounded-full bg-sunken" aria-hidden="true">
              <div className={`h-2 rounded-full ${row.warn ? 'bg-open' : 'bg-ink'}`} style={{ width }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SmallCard({ label, value, note, warn = false, className = '' }) {
  return (
    <div className={`@container flex min-w-0 flex-col justify-between rounded-[10px] border border-line bg-surface p-3 ${className}`}>
      <span className={`type-label flex items-center gap-1 ${warn ? 'text-open' : 'text-muted'}`}>
        {warn && <DotIcon aria-hidden="true" />}
        {label}
      </span>
      <span className={`type-num-tile my-1 block whitespace-nowrap ${warn ? 'text-open' : ''}`}>{value}</span>
      <span className="type-caption text-muted">{note}</span>
    </div>
  );
}

const lineOf = (section, line) => section?.rows.find((row) => row.line === line);
const figure = (row) => row?.amountInPaise;

export default function OwnerHomePage() {
  const date = businessDateToday();
  const interval = useLiveInterval(REFRESH_MS);
  const read = (name, params) => ({
    queryKey: ['owner-home', name, date],
    queryFn: () => getReport(name, params).then((result) => result.data),
    refetchInterval: interval,
  });
  const today = useQuery(read('today', {}));
  const day = useQuery(read('day-close', { date }));
  const hours = useQuery(read('hours', { from: date, to: date }));

  const failed = [today, day, hours].find((query) => query.isError);
  if (failed) {
    return (
      <main className="v2 min-h-full bg-ground p-4">
        <ErrorMessage error={failed.error} />
      </main>
    );
  }
  if (!today.data || !day.data || !hours.data) {
    return (
      <main className="v2 min-h-full bg-ground p-4">
        <Spinner label="Reading today's figures" />
      </main>
    );
  }

  const section = (envelope, key) => envelope.sections?.find((entry) => entry.key === key);
  const sales = section(day.data, 'sales');
  const isOpen = (day.data.openDays ?? []).includes(date);
  // R1's unpaid row, known by where it links rather than by its words.
  const isUnpaidRow = (row) => row.drill?.amountInPaise?.query?.status === 'UNPAID';
  const unpaid = section(today.data, 'money')?.rows.find(isUnpaidRow);
  const unpaidPaise = unpaid?.amountInPaise ?? 0;

  const orderTypes = (section(day.data, 'orderTypes')?.rows ?? [])
    .filter((row) => row.amountInPaise > 0 || row.count > 0)
    .map((row) => ({ label: row.line, amountInPaise: row.amountInPaise, note: `${row.count} ${row.count === 1 ? 'bill' : 'bills'}`, drill: row.drill?.count }));

  const moneySection = section(today.data, 'money');
  const moneyRows = (moneySection?.rows ?? [])
    .filter((row) => row.amountInPaise !== 0)
    .map((row) => ({
      label: row.line,
      amountInPaise: row.amountInPaise,
      drill: row.drill?.amountInPaise,
      warn: isUnpaidRow(row),
      ...(isUnpaidRow(row) || row.line.startsWith('On Hold') ? { note: `${row.count} ${row.count === 1 ? 'bill' : 'bills'}` } : {}),
    }));

  // Every hour from the first bill to the last, quiet hours as zeros (DESIGN-SYSTEM rule 10).
  const allHours = section(hours.data, 'byHour')?.rows ?? [];
  const firstHour = allHours.findIndex((row) => row.billCount > 0);
  const lastHour = allHours.findLastIndex((row) => row.billCount > 0);
  const byHour = firstHour === -1 ? [] : allHours.slice(firstHour, lastHour + 1);
  const busiest = byHour.reduce((best, row) => (best && best.netSalesInPaise >= row.netSalesInPaise ? best : row), null);

  const controls = section(day.data, 'controls');
  const watch = ['Items cancelled', 'Wasted value', 'Discounts', 'Voided bills', 'No Charge', 'Orders cancelled']
    .map((line) => lineOf(controls, line))
    .filter(Boolean);

  return (
    <main className="v2 min-h-full bg-ground">
      <UnclosedDayWarning />
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 lg:py-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="type-title">Today</h1>
            <p className="type-caption text-muted">
              {isOpen ? `Day open · figures to ${formatTimeIst(today.data.extra?.asAt ?? new Date())}` : 'Day closed'}
            </p>
          </div>
          <span className="type-caption rounded-full border border-line bg-surface px-3 py-1">{formatBusinessDate(date)}</span>
        </header>

        <Card>
          <p className="type-label text-muted">Bill total</p>
          <p className="my-2">
            <Money paise={figure(lineOf(sales, 'Bill total'))} size="hero" />
          </p>
          <p className="type-caption flex flex-wrap items-center gap-x-3 text-muted">
            <span>
              Net sales <Money paise={figure(lineOf(sales, 'Net sales'))} size="meta" className="text-ink" />
            </span>
            <span aria-hidden="true">/</span>
            <span>
              GST <Money paise={figure(lineOf(sales, 'GST'))} size="meta" className="text-ink" />
            </span>
          </p>
        </Card>

        <section aria-label="Bills, covers and unpaid" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SmallCard
            label="Bills"
            value={lineOf(sales, 'Bills')?.count ?? 0}
            note={`Average bill ${moneyText(figure(lineOf(sales, 'Average bill')) ?? 0)}`}
          />
          <SmallCard
            label="Covers"
            value={lineOf(sales, 'Covers')?.count ?? 0}
            note={`Average per cover ${moneyText(figure(lineOf(sales, 'Average per cover')) ?? 0)}`}
          />
          <SmallCard
            label="Unpaid"
            value={moneyText(unpaidPaise)}
            note={`${unpaid?.count ?? 0} ${unpaid?.count === 1 ? 'bill' : 'bills'}`}
            warn={unpaidPaise > 0}
            className="col-span-2 sm:col-span-1"
          />
        </section>

        <Card title="Where the sales came from">
          <BarRows rows={orderTypes} emptyMessage="No bills yet today." />
        </Card>

        <Card title="Where the money went">
          <BarRows rows={moneyRows} emptyMessage="No money yet today." />
          {moneyRows.length > 0 && (
            <p className="type-label mt-3 flex justify-between border-t border-line pt-3">
              Total <Money paise={moneySection.totals?.amountInPaise} size="num" tabular />
            </p>
          )}
        </Card>

        <Card
          title="By hour"
          aside={busiest && <span className="type-caption text-muted">Busiest hour {hourLabel(busiest.hour)}</span>}
        >
          <Columns
            data={byHour.map((row) => ({ label: hourLabel(row.hour), value: row.netSalesInPaise }))}
            formatValue={(value) => moneyText(value)}
            formatTick={compactMoneyText}
            height={140}
            caption="Net sales per hour"
            emptyMessage="No bills yet today."
          />
          {byHour.length > 0 && (
            <details className="mt-2">
              <summary className="type-caption cursor-pointer text-muted">Show as a table</summary>
              <table className="type-caption mt-2 w-full">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left font-normal">Hour</th>
                    <th className="text-right font-normal">Bills</th>
                    <th className="text-right font-normal">Net sales</th>
                  </tr>
                </thead>
                <tbody>
                  {byHour.map((row) => (
                    <tr key={row.hour} className="border-t border-line">
                      <td className="py-1">{hourLabel(row.hour)}</td>
                      <td className="py-1 text-right font-mono">{row.billCount}</td>
                      <td className="py-1 text-right">
                        <Money paise={row.netSalesInPaise} size="meta" tabular />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Card>

        <Card title="Watch list">
          <ul className="divide-y divide-line">
            {watch.map((row) => {
              const href = drillHref(row.drill?.count ?? row.drill?.amountInPaise);
              const label = (
                <span className="type-body">
                  {row.line}
                  {row.count !== undefined && <span className="type-caption text-muted"> ({row.count})</span>}
                </span>
              );
              return (
                <li key={row.line} className="flex min-h-12 items-center justify-between gap-3">
                  {href ? (
                    <Link to={href} className="underline-offset-2 hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  <Money paise={row.amountInPaise} size="num" tabular className={row.line === 'Wasted value' && row.amountInPaise > 0 ? 'text-alert' : ''} />
                </li>
              );
            })}
          </ul>
        </Card>

        <BalanceSeal checks={day.data.checks} scope={`for ${formatBusinessDate(date)}`} />

        <Link to="/day-end" className="type-button flex min-h-14 items-center justify-center rounded-lg bg-accent text-on-accent hover:brightness-110">
          Day End
        </Link>
      </div>
    </main>
  );
}
