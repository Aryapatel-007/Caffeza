import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import Spinner from '../../../components/ui/Spinner.jsx';
import { downloadReport, getBillList } from '../../../api/reportsV2.js';
import { businessDateToday } from '../../../utils/formatDate.js';
import { errorMessage } from '../../billing/errorCopy.js';
import BalanceSeal, { FilterSentence } from '../../../components/ui/BalanceSeal.jsx';
import { Cell, OpenDaysBanner } from './reportCells.jsx';

/**
 * R19 Bill List. M19, built in P14.
 *
 * The page every drill down opens. Every filter is read from the address, so a
 * link like /reports/bills?from=2026-09-26&to=2026-09-26&captainId=... opens it
 * already filtered, and the browser's back button works. The filter sentence,
 * the open-day banner and the checks come from the server and sit above the
 * table; the totals row covers every matching bill, not only this page.
 */
const PAGE_SIZE = 50;

export default function BillListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const today = businessDateToday();
  const query = Object.fromEntries(params.entries());
  query.from ??= today;
  query.to ??= query.from;
  query.limit ??= String(PAGE_SIZE);
  const page = Number(query.page ?? 1);

  const result = useQuery({
    queryKey: ['report', 'bills', query],
    queryFn: () => getBillList(query),
    placeholderData: (previous) => previous,
  });

  const setQuery = (changes) => {
    const next = { ...query, ...changes };
    for (const [key, value] of Object.entries(next)) if (value === '' || value === undefined) delete next[key];
    setParams(next);
  };

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { page: _page, limit: _limit, ...filters } = query;
      const { blob, fileName } = await downloadReport('bills', { ...filters, limit: 200 });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const envelope = result.data?.data;
  const meta = result.data?.meta;
  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;

  return (
    <main className="min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-heading">Bill List</h1>
            <p className="type-caption text-muted">The bills behind any number on a report.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="type-caption text-muted">
              From
              <input
                type="date"
                value={query.from}
                max={today}
                onChange={(event) => setQuery({ from: event.target.value, page: '' })}
                className="ml-2 rounded-lg border-2 border-muted px-2 py-1 type-caption text-ink"
              />
            </label>
            <label className="type-caption text-muted">
              To
              <input
                type="date"
                value={query.to}
                max={today}
                onChange={(event) => setQuery({ to: event.target.value, page: '' })}
                className="ml-2 rounded-lg border-2 border-muted px-2 py-1 type-caption text-ink"
              />
            </label>
            <button
              type="button"
              onClick={download}
              disabled={downloading || !envelope}
              className="min-h-12 rounded-lg border border-line px-3 type-caption disabled:opacity-50"
            >
              {downloading ? 'Preparing…' : 'Excel'}
            </button>
            <Link to="/reports" className="type-caption inline-flex min-h-12 items-center text-muted underline">
              Reports
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6">
        {result.isPending && <Spinner label="Loading bills" />}
        {result.isError && <p className="type-body text-alert">{errorMessage(result.error)}</p>}
        {downloadError && <p className="type-caption text-alert">{downloadError}</p>}

        {envelope && (
          <>
            <BalanceSeal
              checks={envelope.checks}
              renderRefs={(check) =>
                check.refs?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuery({ billNumber: check.refs[0], page: '' })}
                    className="type-label min-h-12 text-accent underline underline-offset-4"
                  >
                    Show the bills
                  </button>
                )
              }
            />
            <FilterSentence>{envelope.filterSentence}</FilterSentence>
            <OpenDaysBanner openDays={envelope.openDays} />

            <div className="overflow-x-auto">
              <table className="w-full type-caption">
                <thead>
                  <tr className="border-b border-line text-left type-caption text-muted">
                    {envelope.columns.map((column) => (
                      <th
                        key={column.key}
                        className={`whitespace-nowrap py-2 pr-3 font-medium ${column.type === 'money' || column.type === 'count' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {envelope.rows.map((row) => (
                    <tr
                      key={row.billId}
                      tabIndex={0}
                      onClick={() => navigate(`/reports/bills/${row.billId}`)}
                      onKeyDown={(event) => event.key === 'Enter' && navigate(`/reports/bills/${row.billId}`)}
                      className="cursor-pointer hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {envelope.columns.map((column) => (
                        <td
                          key={column.key}
                          className={`whitespace-nowrap py-2 pr-3 ${column.type === 'money' || column.type === 'count' ? 'text-right' : ''}`}
                        >
                          <Cell type={column.type} value={row[column.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    {envelope.columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap py-2 pr-3 ${column.type === 'money' || column.type === 'count' ? 'text-right' : ''}`}
                      >
                        {index === 0 ? `Total, ${envelope.totals.billCount} bills` : null}
                        {index > 0 && (column.type === 'money' || column.type === 'count') && (
                          <Cell type={column.type} value={envelope.totals[column.key]} />
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
              {envelope.rows.length === 0 && <p className="py-4 type-body text-muted">No bills match. Clear a filter to see more.</p>}
            </div>

            {pages > 1 && (
              <div className="flex items-center gap-3 type-caption">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setQuery({ page: String(page - 1) })}
                  className="min-h-12 rounded-lg border-2 border-muted px-3 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setQuery({ page: String(page + 1) })}
                  className="min-h-12 rounded-lg border-2 border-muted px-3 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
