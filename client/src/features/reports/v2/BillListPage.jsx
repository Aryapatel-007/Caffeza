import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import Spinner from '../../../components/ui/Spinner.jsx';
import { downloadReport, getBillList } from '../../../api/reportsV2.js';
import { businessDateToday } from '../../../utils/formatDate.js';
import { errorMessage } from '../../billing/errorCopy.js';
import { CheckStrip, Cell, OpenDaysBanner } from './reportCells.jsx';

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
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Bill List</h1>
            <p className="text-[13px] leading-[18px] text-steel">The bills behind any number on a report.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] text-steel">
              From
              <input
                type="date"
                value={query.from}
                max={today}
                onChange={(event) => setQuery({ from: event.target.value, page: '' })}
                className="ml-2 rounded-lg border-2 border-steel/40 px-2 py-1 text-[13px] text-ink"
              />
            </label>
            <label className="text-[12px] text-steel">
              To
              <input
                type="date"
                value={query.to}
                max={today}
                onChange={(event) => setQuery({ to: event.target.value, page: '' })}
                className="ml-2 rounded-lg border-2 border-steel/40 px-2 py-1 text-[13px] text-ink"
              />
            </label>
            <button
              type="button"
              onClick={download}
              disabled={downloading || !envelope}
              className="min-h-10 rounded-xl border border-black/5 shadow-card px-3 text-[13px] font-semibold disabled:opacity-50"
            >
              {downloading ? 'Preparing…' : 'Excel'}
            </button>
            <Link to="/reports" className="text-[13px] font-medium text-steel underline">
              Reports
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6">
        {result.isPending && <Spinner label="Loading bills" />}
        {result.isError && <p className="text-[15px] text-mirch">{errorMessage(result.error)}</p>}
        {downloadError && <p className="text-[13px] text-mirch">{downloadError}</p>}

        {envelope && (
          <>
            <p className="text-[13px] font-medium leading-[18px]">{envelope.filterSentence}</p>
            <OpenDaysBanner openDays={envelope.openDays} />
            <CheckStrip
              checks={envelope.checks}
              onOpenRefs={(check) => setQuery({ billNumber: check.refs[0], page: '' })}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-[13px] leading-[18px]">
                <thead>
                  <tr className="border-b border-black/5 text-left text-[12px] uppercase tracking-[0.04em] text-steel">
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
                <tbody className="divide-y divide-steel/15">
                  {envelope.rows.map((row) => (
                    <tr
                      key={row.billId}
                      tabIndex={0}
                      onClick={() => navigate(`/reports/bills/${row.billId}`)}
                      onKeyDown={(event) => event.key === 'Enter' && navigate(`/reports/bills/${row.billId}`)}
                      className="cursor-pointer hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
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
                  <tr className="border-t border-black/5 font-semibold">
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
              {envelope.rows.length === 0 && <p className="py-4 text-[15px] text-steel">No bills match.</p>}
            </div>

            {pages > 1 && (
              <div className="flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setQuery({ page: String(page - 1) })}
                  className="min-h-10 rounded-lg border-2 border-steel/40 px-3 disabled:opacity-40"
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
                  className="min-h-10 rounded-lg border-2 border-steel/40 px-3 disabled:opacity-40"
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
