import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Spinner from '../../../components/ui/Spinner.jsx';
import { getBillDetail } from '../../../api/reportsV2.js';
import { formatBusinessDate, formatTimeIst } from '../../../utils/formatDate.js';
import { formatPaise } from '../../../utils/formatMoney.js';
import { errorMessage } from '../../billing/errorCopy.js';
import { LABELS } from '../labels.js';

/**
 * One bill from a report, in full. M19, built in P14.
 *
 * Every line with its shares of the discount and the GST, every payment with
 * its business date, and a timeline of the order from opening to payment, so
 * a number on a report can be traced to what actually happened.
 */
export default function BillDetailPage() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['report', 'bill', billId], queryFn: () => getBillDetail(billId) });

  if (query.isPending) return <main className="p-6"><Spinner label="Loading the bill" /></main>;
  if (query.isError) return <main className="p-6 text-[15px] text-mirch">{errorMessage(query.error)}</main>;

  const { bill, timeline } = query.data;

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-[18px] font-semibold leading-7">{bill.billNumber}</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              {formatBusinessDate(bill.businessDate)} · {bill.tableName ?? bill.orderType}
              {bill.captainName ? ` · ${bill.captainName}` : ''}
              {bill.isVoided ? ' · Voided' : ''}
            </p>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="text-[13px] font-medium text-steel underline">
            Back
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6">
        <section className="overflow-x-auto">
          <table className="w-full text-[13px] leading-[18px]">
            <thead>
              <tr className="border-b border-black/5 text-left text-[12px] uppercase tracking-[0.04em] text-steel">
                <th className="py-2 pr-3 font-medium">{LABELS.ITEM}</th>
                <th className="py-2 pr-3 font-medium">{LABELS.CATEGORY}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_TOTAL}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_DISCOUNT_SHARE}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_NET_SALES}</th>
                <th className="py-2 text-right font-medium">{LABELS.LINE_GST_SHARE}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel/15">
              {bill.lines.map((line) => (
                <tr key={line.orderLineId}>
                  <td className="py-2 pr-3">{line.quantity} × {line.itemName}{line.variantName ? ` (${line.variantName})` : ''}</td>
                  <td className="py-2 pr-3 text-steel">{line.categoryName ?? 'Not recorded'}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatPaise(line.lineTotalInPaise)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{line.discountShareInPaise === null ? '' : formatPaise(line.discountShareInPaise)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{line.taxableInPaise === null ? '' : formatPaise(line.taxableInPaise)}</td>
                  <td className="py-2 text-right font-mono">{line.taxInPaise === null ? '' : formatPaise(line.taxInPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid max-w-sm gap-1 text-[13px]">
            <div className="flex justify-between"><dt className="text-steel">{LABELS.ITEM_TOTAL}</dt><dd className="font-mono">{formatPaise(bill.subtotalInPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">{LABELS.DISCOUNT}</dt><dd className="font-mono">{formatPaise(bill.discount?.amountInPaise ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">{LABELS.GST}</dt><dd className="font-mono">{formatPaise(bill.totalTaxInPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-steel">{LABELS.ROUND_OFF}</dt><dd className="font-mono">{formatPaise(bill.roundOffInPaise)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>{LABELS.BILL_TOTAL}</dt><dd className="font-mono">{formatPaise(bill.grandTotalInPaise)}</dd></div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">What happened</h2>
          <ol className="grid gap-1 text-[13px] leading-[18px]">
            {timeline.map((event, index) => (
              <li key={`${event.at}-${index}`} className="grid grid-cols-[5.5rem_1fr] gap-3">
                <span className="font-mono text-steel">{formatTimeIst(event.at)}</span>
                <span>
                  <span className="font-medium">{event.event}</span>
                  {event.detail ? ` · ${event.detail}` : ''}
                  {event.by ? ` · ${event.by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Link to={`/bills/${bill.id}`} className="text-[13px] font-medium underline">
          Open this bill at the till
        </Link>
      </div>
    </main>
  );
}
