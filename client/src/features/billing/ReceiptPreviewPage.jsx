import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { getBill, getReceipt } from '../../api/bills.js';

import BillStatusBadge from './BillStatusBadge.jsx';
import { errorMessage } from './errorCopy.js';
import { LABELS } from '../i18n/labels.js';
import BrandLogo from '../../components/ui/BrandLogo.jsx';
import { useTheme } from '../../context/ThemeProvider.jsx';
import { printLogo } from '../brand/brand.js';
import { charactersFor, printText } from '../printing/printText.js';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import { placeLabel } from '../orders/orderLabel.js';
import Money, { moneyText } from '../../components/ui/Money.jsx';

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
  const { brand } = useTheme();
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
      await printText(receipt.data.text, device.paperMm, { logo: printLogo(brand) });
      setToast({ tone: 'success', message: 'Sent to the printer.' });
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <main className="v2 text-ink min-h-full bg-ground px-4 py-6 lg:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to={`/bills/${billId}`}
              aria-label="Back to the bill"
              className="flex size-10 items-center justify-center rounded-full bg-sunken type-heading hover:bg-sunken"
            >
              ←
            </Link>
            <div>
              <p className="type-caption text-muted">Bills / Receipt</p>
              <h1 className="type-title">Receipt preview</h1>
            </div>
          </div>
          {bill.data && (
            <div className="flex items-center gap-2 rounded-lg bg-sunken px-4 py-2 border border-line">
              <span className="type-num-meta">{bill.data.billNumber}</span>
              <span className="text-muted">·</span>
              <span className="type-caption text-muted">
                {placeLabel(bill.data)}
              </span>
              <BillStatusBadge bill={bill.data} />
            </div>
          )}
        </header>

        <div className="grid grid-cols-12 items-start gap-6">
          <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
            <section className="flex flex-col gap-4 rounded-[10px] bg-surface p-4 border border-line">
              <div>
                <p className="type-caption text-muted">This device</p>
                <h2 className="type-heading">Print the receipt</h2>
              </div>

              <button
                type="button"
                onClick={print}
                disabled={printing || !receipt.data}
                className="flex min-h-14 w-full items-center justify-center rounded-lg bg-accent type-button text-on-accent disabled:opacity-50"
              >
                {printing ? 'Printing…' : LABELS.printReceipt}
              </button>

              <fieldset>
                <legend className="mb-2 type-caption text-muted">
                  Paper width
                </legend>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
                  {PAPER_SIZES.map((size) => (
                    <button
                      key={size.mm}
                      type="button"
                      aria-pressed={device.paperMm === size.mm}
                      onClick={() => updateDevice({ paperMm: size.mm })}
                      className={[
                        'min-h-12 rounded-lg type-caption',
                        '',
                        device.paperMm === size.mm ? 'bg-surface border border-line' : 'text-muted',
                      ].join(' ')}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 type-caption text-muted">
                  Saved for this device, like the setting on the This device page.
                </p>
              </fieldset>

              <Link
                to={`/bills/${billId}`}
                className="flex min-h-12 items-center justify-center rounded-lg bg-sunken type-caption hover:bg-sunken"
              >
                Back to the bill
              </Link>
            </section>
          </div>

          <div className="col-span-12 flex flex-col items-center xl:col-span-5">
            <p className="mb-3 rounded-lg bg-sunken/70 px-4 py-2 type-num-meta">
              As printed · {device.paperMm} mm · {width} characters per line
            </p>

            {receipt.isPending && <Spinner label="Laying out the receipt" />}
            {receipt.isError && <p className="type-body text-alert">{errorMessage(receipt.error)}</p>}

            {receipt.data && (
              <div className="w-fit max-w-full overflow-x-auto bg-surface px-6 py-8 shadow-float [clip-path:polygon(0_6px,3%_0,6%_6px,9%_0,12%_6px,15%_0,18%_6px,21%_0,24%_6px,27%_0,30%_6px,33%_0,36%_6px,39%_0,42%_6px,45%_0,48%_6px,51%_0,54%_6px,57%_0,60%_6px,63%_0,66%_6px,69%_0,72%_6px,75%_0,78%_6px,81%_0,84%_6px,87%_0,90%_6px,93%_0,96%_6px,100%_0,100%_calc(100%-6px),97%_100%,94%_calc(100%-6px),91%_100%,88%_calc(100%-6px),85%_100%,82%_calc(100%-6px),79%_100%,76%_calc(100%-6px),73%_100%,70%_calc(100%-6px),67%_100%,64%_calc(100%-6px),61%_100%,58%_calc(100%-6px),55%_100%,52%_calc(100%-6px),49%_100%,46%_calc(100%-6px),43%_100%,40%_calc(100%-6px),37%_100%,34%_calc(100%-6px),31%_100%,28%_calc(100%-6px),25%_100%,22%_calc(100%-6px),19%_100%,16%_calc(100%-6px),13%_100%,10%_calc(100%-6px),7%_100%,4%_calc(100%-6px),0_100%)]">
                {/* The logo prints above the text, as on paper. */}
                <BrandLogo shape="paper" className="mx-auto mb-3 w-3/5" />
                <pre
                  aria-label="Receipt text"
                  className="whitespace-pre type-num-meta text-black"
                  style={{ width: `${width}ch` }}
                >
                  {receipt.data.text}
                </pre>
              </div>
            )}
          </div>

          <div className="col-span-12 flex flex-col gap-4 xl:col-span-3">
            {bill.data && (
              <section className="flex flex-col gap-3 rounded-[10px] bg-surface p-4 border border-line">
                <p className="type-caption text-muted">On this bill</p>
                <dl className="flex flex-col gap-2 type-caption">
                  <Row label="Item total" value={<Money paise={bill.data.subtotalInPaise} />} />
                  {bill.data.discount && (
                    <Row
                      label="Discount"
                      value={`− ${moneyText(bill.data.discount.amountInPaise)}`}
                      tone="text-ok"
                    />
                  )}
                  <Row label="GST" value={<Money paise={bill.data.totalTaxInPaise} />} />
                  {bill.data.roundOffInPaise !== 0 && (
                    <Row label="Round-off" value={<Money paise={bill.data.roundOffInPaise} />} />
                  )}
                  <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                    <dt className="font-semibold">Bill total</dt>
                    <dd className="type-num-tile"><Money paise={bill.data.grandTotalInPaise} /></dd>
                  </div>
                </dl>
              </section>
            )}

            <p className="rounded-[10px] bg-sunken p-4 type-caption text-muted">
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

function Row({ label, value, tone = 'text-muted' }) {
  return (
    <div className="flex justify-between">
      <dt className={tone}>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
