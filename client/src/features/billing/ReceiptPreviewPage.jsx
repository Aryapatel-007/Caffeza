import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { getBill, getReceipt } from '../../api/bills.js';
import { formatPaise } from '../../utils/formatMoney.js';
import BillStatusBadge from './BillStatusBadge.jsx';
import { errorMessage } from './errorCopy.js';
import { BILL_LABELS } from './labels.js';
import { charactersFor, printText } from '../printing/printText.js';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import { placeLabel } from '../orders/orderLabel.js';

const PAPER_SIZES = [
  { mm: 58, label: '58 mm · 32 characters' },
  { mm: 80, label: '80 mm · 48 characters' },
];

/**
 * The receipt, exactly as it prints.
 *
 * The slip is the server's own text from GET /bills/:billId/receipt, laid out
 * at this device's paper width, shown in a monospace block the same width as
 * the paper. Nothing on it is drawn or worked out here, so the preview cannot
 * disagree with the paper. Printing goes through the browser like every other
 * print in the product; the server never talks to a printer.
 *
 * The paper width is the device's setting (the "This device" page), so
 * changing it here changes it for every print from this device.
 */
export default function ReceiptPreviewPage() {
  const { billId } = useParams();
  const [device, updateDevice] = useDeviceSettings();
  const [toast, setToast] = useState(null);
  const [printing, setPrinting] = useState(false);

  const width = charactersFor(device.paperMm);

  const bill = useQuery({ queryKey: ['bill', billId], queryFn: () => getBill(billId) });
  const receipt = useQuery({
    queryKey: ['receipt', billId, width],
    queryFn: () => getReceipt(billId, width),
  });

  const print = async () => {
    if (!receipt.data) return;
    setPrinting(true);
    try {
      await printText(receipt.data.text, device.paperMm);
      setToast({ tone: 'success', message: 'Sent to the printer.' });
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <main className="min-h-full bg-paper px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/bills/${billId}`}
              aria-label="Back to the bill"
              className="flex size-10 items-center justify-center rounded-full bg-linen-2 text-[20px] hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              ←
            </Link>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-steel">Bills / Receipt</p>
              <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.015em]">Receipt preview</h1>
            </div>
          </div>
          {bill.data && (
            <div className="flex items-center gap-2 rounded-xl bg-linen px-4 py-2 shadow-card">
              <span className="font-mono text-[13px] font-bold">{bill.data.billNumber}</span>
              <span className="text-steel">·</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-steel">
                {placeLabel(bill.data)}
              </span>
              <BillStatusBadge bill={bill.data} />
            </div>
          )}
        </header>

        <div className="grid grid-cols-12 items-start gap-6">
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-steel">This device</p>
                <h2 className="text-[20px] font-semibold leading-7">Print the receipt</h2>
              </div>

              <button
                type="button"
                onClick={print}
                disabled={printing || !receipt.data}
                className="flex h-14 w-full items-center justify-center rounded-full bg-chana text-[15px] font-bold text-ink shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
              >
                {printing ? 'Printing…' : BILL_LABELS.printReceipt.en}
              </button>

              <fieldset>
                <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-steel">
                  Paper width
                </legend>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-linen-2 p-1">
                  {PAPER_SIZES.map((size) => (
                    <button
                      key={size.mm}
                      type="button"
                      aria-pressed={device.paperMm === size.mm}
                      onClick={() => updateDevice({ paperMm: size.mm })}
                      className={[
                        'h-10 rounded-full text-[12px] font-semibold',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                        device.paperMm === size.mm ? 'bg-white shadow-card' : 'text-steel',
                      ].join(' ')}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-4 text-steel">
                  Saved for this device, like the setting on the This device page.
                </p>
              </fieldset>

              <Link
                to={`/bills/${billId}`}
                className="flex h-12 items-center justify-center rounded-full bg-linen-2 text-[13px] font-medium hover:bg-linen-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Back to the bill
              </Link>
            </section>
          </div>

          <div className="col-span-12 flex flex-col items-center xl:col-span-5">
            <p className="mb-3 rounded-full bg-linen-3/70 px-4 py-1.5 font-mono text-[12px] font-semibold">
              As printed · {device.paperMm} mm · {width} characters per line
            </p>

            {receipt.isPending && <Spinner label="Laying out the receipt" />}
            {receipt.isError && <p className="text-[15px] text-mirch">{errorMessage(receipt.error)}</p>}

            {receipt.data && (
              <div className="w-fit max-w-full overflow-x-auto bg-white px-6 py-8 shadow-lift [clip-path:polygon(0_6px,3%_0,6%_6px,9%_0,12%_6px,15%_0,18%_6px,21%_0,24%_6px,27%_0,30%_6px,33%_0,36%_6px,39%_0,42%_6px,45%_0,48%_6px,51%_0,54%_6px,57%_0,60%_6px,63%_0,66%_6px,69%_0,72%_6px,75%_0,78%_6px,81%_0,84%_6px,87%_0,90%_6px,93%_0,96%_6px,100%_0,100%_calc(100%-6px),97%_100%,94%_calc(100%-6px),91%_100%,88%_calc(100%-6px),85%_100%,82%_calc(100%-6px),79%_100%,76%_calc(100%-6px),73%_100%,70%_calc(100%-6px),67%_100%,64%_calc(100%-6px),61%_100%,58%_calc(100%-6px),55%_100%,52%_calc(100%-6px),49%_100%,46%_calc(100%-6px),43%_100%,40%_calc(100%-6px),37%_100%,34%_calc(100%-6px),31%_100%,28%_calc(100%-6px),25%_100%,22%_calc(100%-6px),19%_100%,16%_calc(100%-6px),13%_100%,10%_calc(100%-6px),7%_100%,4%_calc(100%-6px),0_100%)]">
                <pre
                  aria-label="Receipt text"
                  className="whitespace-pre font-mono text-[12px] leading-[18px] text-black"
                  style={{ width: `${width}ch` }}
                >
                  {receipt.data.text}
                </pre>
              </div>
            )}
          </div>

          <div className="col-span-12 flex flex-col gap-4 xl:col-span-3">
            {bill.data && (
              <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-steel">On this bill</p>
                <dl className="flex flex-col gap-2 text-[13px]">
                  <Row label="Item total" value={formatPaise(bill.data.subtotalInPaise)} />
                  {bill.data.discount && (
                    <Row
                      label="Discount"
                      value={`− ${formatPaise(bill.data.discount.amountInPaise)}`}
                      tone="text-patta"
                    />
                  )}
                  <Row label="GST" value={formatPaise(bill.data.totalTaxInPaise)} />
                  {bill.data.roundOffInPaise !== 0 && (
                    <Row label="Round-off" value={formatPaise(bill.data.roundOffInPaise)} />
                  )}
                  <div className="mt-1 flex items-baseline justify-between border-t border-black/5 pt-2">
                    <dt className="font-semibold">Bill total</dt>
                    <dd className="font-mono text-[18px] font-bold">{formatPaise(bill.data.grandTotalInPaise)}</dd>
                  </div>
                </dl>
              </section>
            )}

            <p className="rounded-2xl bg-linen p-4 text-[12px] leading-4 text-steel">
              The receipt is laid out by the server from the bill as it was frozen. Its header lines
              come from Settings, under Receipt.
            </p>
          </div>
        </div>
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

function Row({ label, value, tone = 'text-steel' }) {
  return (
    <div className="flex justify-between">
      <dt className={tone}>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
