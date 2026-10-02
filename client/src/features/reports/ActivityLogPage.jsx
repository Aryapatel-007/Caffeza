import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';
import { listAudit } from '../../api/audit.js';
import { businessDateToday, formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { formatPaise } from '../../utils/formatMoney.js';
import { errorMessage } from '../billing/errorCopy.js';
import { PRESETS, presetOf, presetRange } from './dateRanges.js';

/** What each audit action reads as. The codes are M8's; these are the words on screen. */
const ACTION_WORDS = {
  BILL_VOIDED: 'Bill voided',
  DISCOUNT_APPLIED: 'Discount applied',
  STOCK_ADJUSTED: 'Stock adjusted',
  ORDER_CANCELLED: 'Order cancelled',
  SETTINGS_CHANGED: 'Settings changed',
  LINE_CANCELLED_AFTER_PREP: 'Cancelled after preparation',
  PAYMENT_METHOD_CORRECTED: 'Payment method changed',
  NO_CHARGE_GIVEN: 'No Charge given',
  BILL_CHARGED_TO_ACCOUNT: 'Charged to an On Hold account',
  ACCOUNT_BALANCE_ADJUSTED: 'Account balance adjusted',
  PLATFORM_PAYOUT_RECORDED: 'Platform payout recorded',
  CASH_PAID_OUT: 'Cash paid out',
  DAY_CLOSED: 'Day closed',
  DAY_REOPENED: 'Day reopened',
  USER_DEACTIVATED: 'Staff switched off',
  USER_REACTIVATED: 'Staff switched back on',
  USER_ROLE_CHANGED: 'Staff role changed',
  USER_PASSWORD_RESET: 'Password reset',
  USER_PIN_RESET: 'Attendance PIN set',
  MENU_PRICE_CHANGED: 'Price changed',
  RECIPE_CHANGED: 'Recipe changed',
  ATTENDANCE_CORRECTED: 'Attendance corrected',
};

/**
 * R18 Activity Log: M8's audit trail, read through `GET /audit`. P18.
 *
 * Not an engine report, as the contract says, so it has no Excel file of its
 * own. A manager sees only the actions M8 opens to them; the server narrows the
 * query, and this screen shows whatever comes back.
 */
export default function ActivityLogPage() {
  const [params, setParams] = useSearchParams();
  const today = businessDateToday();
  const query = Object.fromEntries(params.entries());
  query.from ??= today;
  query.to ??= query.from;
  query.limit ??= '50';
  const page = Number(query.page ?? 1);

  const result = useQuery({
    queryKey: ['audit', query],
    queryFn: () => listAudit(query),
    placeholderData: (previous) => previous,
  });

  const setQuery = (changes) => {
    const next = { ...query, ...changes };
    if (!('page' in changes)) delete next.page;
    for (const [key, value] of Object.entries(next)) if (!value) delete next[key];
    setParams(next);
  };

  const lines = result.data?.data ?? [];
  const meta = result.data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
  const current = presetOf({ from: query.from, to: query.to });
  const field = 'h-11 rounded-full bg-linen px-4 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-chana';

  return (
    <main className="min-h-full bg-paper px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header>
          <p className="text-[12px] font-medium text-steel">
            <Link to="/reports" className="hover:underline">
              Reports
            </Link>{' '}
            › R18
          </p>
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">Activity Log</h1>
          <p className="text-[13px] leading-[18px] text-steel">Who did something sensitive?</p>
        </header>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-card">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={current === preset.key}
              onClick={() => setQuery(presetRange(preset.key, today))}
              className={['h-9 rounded-full px-3.5 text-[12px] font-medium', current === preset.key ? 'bg-ink text-white' : 'bg-linen-2 text-steel'].join(' ')}
            >
              {preset.label}
            </button>
          ))}
          <input type="date" aria-label="From" value={query.from} max={today} onChange={(event) => setQuery({ from: event.target.value })} className={field} />
          <input type="date" aria-label="To" value={query.to} max={today} onChange={(event) => setQuery({ to: event.target.value })} className={field} />
          <select value={query.action ?? ''} onChange={(event) => setQuery({ action: event.target.value })} className="h-11 rounded-full bg-linen px-4 text-[13px]" aria-label="Action">
            <option value="">Every action</option>
            {Object.entries(ACTION_WORDS).map(([code, words]) => (
              <option key={code} value={code}>
                {words}
              </option>
            ))}
          </select>
        </section>

        {result.isPending && <Spinner label="Reading the log" />}
        {result.isError && <p className="rounded-2xl bg-white p-4 text-[14px] text-mirch shadow-card">{errorMessage(result.error)}</p>}

        {result.isSuccess && lines.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-[14px] text-steel shadow-card">Nothing recorded in this range.</p>
        )}

        {lines.length > 0 && (
          <ul className="divide-y divide-linen-3 rounded-2xl bg-white shadow-card">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">
                    {ACTION_WORDS[line.action] ?? line.action}
                    {line.entityLabel && <span className="font-mono font-normal text-steel"> · {line.entityLabel}</span>}
                  </p>
                  <p className="text-[13px] leading-[18px]">{line.reason}</p>
                  <p className="text-[12px] text-steel">
                    {line.actorName ?? 'Unknown'}, {line.actorRole ?? 'role not recorded'}
                    {line.actorRoleIsCurrent && ' (role now)'} · {formatDateIst(line.at)} {formatTimeIst(line.at)}
                  </p>
                </div>
                {line.amountInPaise !== null && (
                  <span className="font-mono text-[15px] font-bold">{formatPaise(line.amountInPaise)}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {meta && meta.total > meta.limit && (
          <nav className="flex items-center justify-end gap-2" aria-label="Pages">
            <span className="text-[12px] text-steel">
              Page <span className="font-mono">{page}</span> of <span className="font-mono">{pages}</span>
            </span>
            <button type="button" disabled={page <= 1} onClick={() => setQuery({ page: String(page - 1) })} className="h-9 rounded-lg bg-linen-2 px-3 text-[13px] disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={page >= pages} onClick={() => setQuery({ page: String(page + 1) })} className="h-9 rounded-lg bg-linen-2 px-3 text-[13px] disabled:opacity-40">
              Next
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
