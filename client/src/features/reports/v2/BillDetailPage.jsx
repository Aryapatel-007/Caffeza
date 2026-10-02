import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';

import Spinner from '../../../components/ui/Spinner.jsx';
import { getBillDetail } from '../../../api/reportsV2.js';
import { formatBusinessDate, formatTimeIst } from '../../../utils/formatDate.js';

import { errorMessage } from '../../billing/errorCopy.js';
import { LABELS } from '../labels.js';
import Money, { moneyText } from '../../../components/ui/Money.jsx';

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
  if (query.isError) return <main className="p-6 type-body text-alert">{errorMessage(query.error)}</main>;

  const { bill, timeline } = query.data;

  return (
    <main className="min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <h1 className="type-num-tile">{bill.billNumber}</h1>
            <p className="type-caption text-muted">
              {formatBusinessDate(bill.businessDate)} · {bill.tableName ?? bill.orderType}
              {bill.captainName ? ` · ${bill.captainName}` : ''}
              {bill.isVoided ? ' · Voided' : ''}
            </p>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="type-caption text-muted underline">
            Back
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6">
        <section className="overflow-x-auto">
          <table className="w-full type-caption">
            <thead>
              <tr className="border-b border-line text-left type-caption text-muted">
                <th className="py-2 pr-3 font-medium">{LABELS.ITEM}</th>
                <th className="py-2 pr-3 font-medium">{LABELS.CATEGORY}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_TOTAL}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_DISCOUNT_SHARE}</th>
                <th className="py-2 pr-3 text-right font-medium">{LABELS.LINE_NET_SALES}</th>
                <th className="py-2 text-right font-medium">{LABELS.LINE_GST_SHARE}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bill.lines.map((line) => (
                <tr key={line.orderLineId}>
                  <td className="py-2 pr-3">{line.quantity} × {line.itemName}{line.variantName ? ` (${line.variantName})` : ''}</td>
                  <td className="py-2 pr-3 text-muted">{line.categoryName ?? 'Not recorded'}</td>
                  <td className="py-2 pr-3 text-right font-mono"><Money paise={line.lineTotalInPaise} tabular /></td>
                  <td className="py-2 pr-3 text-right font-mono">{line.discountShareInPaise === null ? '' : moneyText(line.discountShareInPaise)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{line.taxableInPaise === null ? '' : moneyText(line.taxableInPaise)}</td>
                  <td className="py-2 text-right font-mono">{line.taxInPaise === null ? '' : moneyText(line.taxInPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid max-w-sm gap-1 type-caption">
            <div className="flex justify-between"><dt className="text-muted">{LABELS.ITEM_TOTAL}</dt><dd className="font-mono"><Money paise={bill.subtotalInPaise} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">{LABELS.DISCOUNT}</dt><dd className="font-mono"><Money paise={bill.discount?.amountInPaise ?? 0} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">{LABELS.GST}</dt><dd className="font-mono"><Money paise={bill.totalTaxInPaise} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">{LABELS.ROUND_OFF}</dt><dd className="font-mono"><Money paise={bill.roundOffInPaise} /></dd></div>
            <div className="flex justify-between font-semibold"><dt>{LABELS.BILL_TOTAL}</dt><dd className="font-mono"><Money paise={bill.grandTotalInPaise} /></dd></div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 type-label text-muted">What happened</h2>
          <ol className="grid gap-1 type-caption">
            {timeline.map((event, index) => (
              <li key={`${event.at}-${index}`} className="grid grid-cols-[5.5rem_1fr] gap-3">
                <span className="font-mono text-muted">{formatTimeIst(event.at)}</span>
                <span>
                  <span className="font-medium">{event.event}</span>
                  {event.detail ? ` · ${event.detail}` : ''}
                  {event.by ? ` · ${event.by}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Link to={`/bills/${bill.id}`} className="type-caption underline">
          Open this bill at the till
        </Link>
      </div>
    </main>
  );
}
