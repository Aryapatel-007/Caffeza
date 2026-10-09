/**
 * The full-page tax invoice, for A4 and A5. P25 Part C4.
 *
 * Laid out from GET /bills/:billId/invoice, the same data the thermal receipt
 * is laid out from on the server, so the two never print different amounts.
 * One function builds the page for both printing and the receipt preview.
 *
 * Black on white whatever the screen's theme, 12 mm margins from `pageCss`, no
 * table row cut across a page. Every value is escaped; every amount goes
 * through `moneyText`; every label is from docs/GLOSSARY.md.
 *
 * This is a printed document, not a React screen, so it draws the logo with
 * its own <img> from the data URL BrandLogo already holds. The design guard
 * names this file as the one exception, which is why the thermal bill's logo
 * markup, `thermalLogoHtml`, lives here too.
 */
import { moneyText } from '../../components/ui/Money.jsx';

import { billFontPx, DEFAULT_BILL_TEXT_SIZE } from './printers.js';
import { escapeHtml } from './printText.js';

const ORDER_TYPE_WORDS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

const percent = (bps) => `${bps / 100}%`;

/** The styles of the page, inside the print frame or the preview frame. */
export const INVOICE_STYLES = `
  .invoice { font: 10pt/1.35 "Anek Latin", system-ui, sans-serif; color: black; }
  .invoice h1 { font-size: 16pt; margin: 0; }
  .invoice .muted { color: dimgray; }
  .invoice .head { display: flex; justify-content: space-between; gap: 6mm; align-items: flex-start; }
  .invoice .logo { max-height: 18mm; max-width: 50mm; display: block; margin-bottom: 2mm; }
  .invoice .box { border: 0.3mm solid black; padding: 2mm 3mm; min-width: 50mm; }
  .invoice .box div { display: flex; justify-content: space-between; gap: 4mm; }
  .invoice .title { text-align: center; font-weight: 700; letter-spacing: 0.08em; margin: 4mm 0 2mm; }
  .invoice .duplicate { text-align: center; font-weight: 700; border: 0.3mm solid black; padding: 1mm; margin-bottom: 3mm; }
  .invoice table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  .invoice th, .invoice td { padding: 1.2mm 1.5mm; border-bottom: 0.2mm solid darkgray; text-align: left; vertical-align: top; }
  .invoice th { border-bottom: 0.4mm solid black; font-weight: 600; }
  .invoice .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .invoice tr { break-inside: avoid; page-break-inside: avoid; }
  .invoice .totals { margin-left: auto; width: 60%; margin-top: 3mm; break-inside: avoid; }
  .invoice .totals div { display: flex; justify-content: space-between; padding: 0.8mm 0; }
  .invoice .grand { border-top: 0.4mm solid black; border-bottom: 0.4mm solid black; font-size: 14pt; font-weight: 700; margin-top: 1mm; }
  .invoice .foot { margin-top: 6mm; text-align: center; break-inside: avoid; }
  .invoice .review { display: flex; flex-direction: column; align-items: center; gap: 1mm; margin-top: 3mm; }
  .invoice .review svg { width: 28mm; height: 28mm; }
  .invoice .voided { text-align: center; font-weight: 700; font-size: 14pt; margin: 3mm 0; }
`;

function money(paise) {
  return escapeHtml(moneyText(paise));
}

/** A row of the totals block. */
const total = (label, paise, className = '') =>
  `<div class="${className}"><span>${escapeHtml(label)}</span><span class="num">${money(paise)}</span></div>`;

/**
 * The page as HTML. `qrSvg` is the review link's QR code, already an SVG
 * string from the qrcode package; `logoDataUrl` is the restaurant's logo for
 * light grounds, or null.
 */
export function invoiceHtml(data, { qrSvg = null, logoDataUrl = null } = {}) {
  const r = data.restaurant;
  const details = [
    r.legalName,
    r.address,
    r.phone ? `Phone ${r.phone}` : null,
    r.gstin ? `GSTIN ${r.gstin}` : null,
    r.fssaiNumber ? `FSSAI ${r.fssaiNumber}` : null,
  ].filter(Boolean);

  const facts = [
    ['Invoice number', data.billNumber],
    ['Time issued', data.issuedAtIst],
    ['Order type', ORDER_TYPE_WORDS[data.orderType] ?? data.orderType],
    ['Table', data.tableName],
    ['Captain', data.captainName],
    ['Covers', data.guestCount],
    [data.platform?.name, data.platform?.orderId],
  ].filter(([label, value]) => label && value !== null && value !== undefined && value !== '');

  const lineRows = data.lines
    .map((line) => {
      const name = line.itemName + (line.variantName ? ` (${line.variantName})` : '');
      const addOns = line.addOnNames.length ? `<div class="muted">+ ${escapeHtml(line.addOnNames.join(', '))}</div>` : '';
      return `<tr><td>${escapeHtml(name)}${addOns}</td><td class="num">${line.quantity}</td><td class="num">${money(line.unitPriceInPaise)}</td><td class="num">${money(line.lineTotalInPaise)}</td></tr>`;
    })
    .join('');

  const taxRows = data.taxRows
    .map(
      (row) =>
        `<tr><td>${percent(row.taxRateBps)}</td><td class="num">${money(row.netSalesInPaise)}</td><td class="num">${money(row.cgstInPaise)}</td><td class="num">${money(row.sgstInPaise)}</td></tr>`,
    )
    .join('');

  const payments = data.payments.map((payment) => total(payment.methodName, payment.amountInPaise)).join('');

  return `<div class="invoice">
  ${data.isDuplicate ? '<div class="duplicate">DUPLICATE</div>' : ''}
  <div class="head">
    <div>
      ${logoDataUrl ? `<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="" />` : ''}
      ${r.headerAbove ? `<div class="muted">${escapeHtml(r.headerAbove)}</div>` : ''}
      <h1>${escapeHtml(r.name)}</h1>
      ${r.headerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      ${details.map((line) => `<div class="muted">${escapeHtml(line)}</div>`).join('')}
    </div>
    <div class="box">${facts.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
  </div>
  <div class="title">TAX INVOICE</div>
  ${data.isVoided ? '<div class="voided">VOIDED</div>' : ''}
  <table>
    <thead><tr><th>Item</th><th class="num">Quantity</th><th class="num">Rate</th><th class="num">Line total</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <table>
    <thead><tr><th>Tax rate</th><th class="num">Net sales</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead>
    <tbody>${taxRows}</tbody>
  </table>
  <div class="totals">
    ${total('Item total', data.itemTotalInPaise)}
    ${data.discount ? total(data.discount.label, -data.discount.amountInPaise) : ''}
    ${data.discount?.reason ? `<div class="muted"><span>${escapeHtml(data.discount.reason)}</span></div>` : ''}
    ${total('CGST', data.cgstInPaise)}
    ${total('SGST', data.sgstInPaise)}
    ${data.roundOffInPaise !== 0 ? total('Round-off', data.roundOffInPaise) : ''}
    ${total('Bill total', data.billTotalInPaise, 'grand')}
    ${payments}
    ${data.accountName ? `<div><span>On Hold</span><span>${escapeHtml(data.accountName)}</span></div>` : ''}
  </div>
  <div class="foot">
    <div>${escapeHtml(data.footerText ?? 'Thank you')}</div>
    ${qrSvg ? `<div class="review">${qrSvg}<div>Scan to review us</div></div>` : ''}
  </div>
</div>`;
}

/**
 * The thermal bill. 2026-10-09, at Z Chaat's request: laid out like the bill
 * their guests know from their old system, from the same data as the full
 * page, so the two never print different amounts. Printed words are from
 * docs/GLOSSARY.md section 19. Bold sans-serif in solid black, because thin
 * monospace printed faint on their Rugtek. `logoDataUrl` is already pure black
 * and white (printBill.js); `qrSvg` is the review link's code.
 */
export const THERMAL_BILL_STYLES = `
  .tb { font-family: Arial, Helvetica, "Liberation Sans", sans-serif; font-weight: 700; color: black; line-height: 1.25; }
  .tb .c { text-align: center; } .tb .r { text-align: right; }
  .tb .logo { display: block; margin: 0 auto 4mm; height: auto; }
  .tb .store { font-size: 1.1em; }
  .tb .big { font-size: 1.3em; }
  .tb hr { border: 0; border-top: 1px solid black; margin: 1.2mm 0; }
  .tb .pair { display: flex; justify-content: space-between; gap: 2mm; }
  .tb .pair span:last-child { white-space: nowrap; text-align: right; }
  .tb table { width: 100%; border-collapse: collapse; font-size: inherit; }
  .tb th, .tb td { padding: 0.4mm 0; vertical-align: top; font-weight: 700; font-size: inherit; }
  .tb .q, .tb .p, .tb .a { padding-left: 1mm; }
  .tb th { text-align: left; }
  .tb .q { text-align: center; width: 9%; } .tb .p, .tb .a { text-align: right; width: 19%; white-space: nowrap; }
  .tb .addon { font-size: 0.9em; padding-left: 2mm; }
  .tb .review { display: flex; flex-direction: column; align-items: center; gap: 1mm; margin-top: 2mm; }
  .tb .review svg { width: 26mm; height: 26mm; }
  .tb .foot { margin-top: 2.5mm; }
  .tb .feed { height: 4mm; }`;

const ORDER_PLACE_WORDS = { DINE_IN: 'Dine In', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };


/** "09/10/2026 14:57" as "09/10/26" and "14:57". */
function dateAndTime(stamp = '') {
  const [date = '', time = ''] = stamp.split(' ');
  const [day, month, year = ''] = date.split('/');
  return { date: day && month ? `${day}/${month}/${year.slice(-2)}` : date, time };
}

export function thermalBillHtml(data, { printer, logoDataUrl = null, qrSvg = null, textSize = DEFAULT_BILL_TEXT_SIZE } = {}) {
  const r = data.restaurant;
  const plain = (paise) => moneyText(paise, { symbol: false });
  const row = (left, right, cls = '') => `<div class="pair ${cls}"><span>${left}</span><span>${right}</span></div>`;
  const { date, time } = dateAndTime(data.issuedAtIst);
  const place = data.platform
    ? `${escapeHtml(data.platform.name)}: ${escapeHtml(data.platform.orderId)}`
    : `${ORDER_PLACE_WORDS[data.orderType] ?? ''}${data.tableName ? `: ${escapeHtml(data.tableName)}` : ''}`;

  const items = data.lines
    .map((line) => {
      const name = escapeHtml(line.itemName + (line.variantName ? ` (${line.variantName})` : ''));
      const each = Number.isInteger(line.lineTotalInPaise / line.quantity) ? line.lineTotalInPaise / line.quantity : line.unitPriceInPaise;
      const addOns = line.addOnNames.length ? `<div class="addon">+ ${escapeHtml(line.addOnNames.join(', '))}</div>` : '';
      return `<tr><td>${name}${addOns}</td><td class="q">${line.quantity}</td><td class="p">${plain(each)}</td><td class="a">${plain(line.lineTotalInPaise)}</td></tr>`;
    })
    .join('');
  const totalQty = data.lines.reduce((sum, line) => sum + line.quantity, 0);

  const taxes = data.taxRows
    .map((slab) => {
      const half = slab.taxRateBps / 200;
      return row(`CGST@${half}%`, plain(slab.cgstInPaise)) + row(`SGST@${half}%`, plain(slab.sgstInPaise));
    })
    .join('');
  const roundOff = data.roundOffInPaise === 0 ? '' : row('Round off', `${data.roundOffInPaise > 0 ? '+' : ''}${plain(data.roundOffInPaise)}`);
  const guest = data.customer;
  const storeLines = [
    ...r.addressLines,
    r.phone ? `Mo No-${r.phone}` : null,
    r.gstin ? `GSTIN: ${r.gstin}` : null,
    r.fssaiNumber ? `FSSAI: ${r.fssaiNumber}` : null,
  ].filter(Boolean);

  return `<div class="tb" style="font-size: ${billFontPx(printer, textSize)}px">
  ${logoDataUrl ? `<img class="logo" src="${escapeHtml(logoDataUrl)}" alt="" style="width: ${printer === 'THERMAL_58' ? 30 : 45}mm" />` : ''}
  ${data.isDuplicate ? '<div class="c">*** DUPLICATE ***</div>' : ''}
  <div class="c">
    ${r.headerAbove ? `<div>${escapeHtml(r.headerAbove)}</div>` : ''}
    <div class="store">${escapeHtml(r.legalName || r.name)}</div>
    ${r.headerLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
    ${storeLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
  </div>
  <hr />
  <div class="c">TAX INVOICE</div>
  ${data.isVoided ? '<div class="c big">*** VOIDED ***</div>' : ''}
  <hr />
  ${
    guest
      ? `<div>Name: ${escapeHtml(guest.name ?? '')}${guest.mobileLast4 ? ` (M: XXXXXX${escapeHtml(guest.mobileLast4)})` : ''}</div><hr />`
      : ''
  }
  ${row(`Date: ${escapeHtml(date)}`, place)}
  <div>${escapeHtml(time)}</div>
  ${row(data.cashierName ? `Cashier: ${escapeHtml(data.cashierName)}` : '', `Bill No.: ${escapeHtml(data.billNumber)}`)}
  ${data.captainName ? `<div>Captain: ${escapeHtml(data.captainName)}</div>` : ''}
  <hr />
  <table>
    <thead><tr><th>Item</th><th class="q">Qty.</th><th class="p">Price</th><th class="a">Amount</th></tr></thead>
    <tbody><tr><td colspan="4"><hr /></td></tr>${items}</tbody>
  </table>
  <hr />
  <div class="totals">
    ${row(`Total Qty: ${totalQty}`, `Sub Total&nbsp;&nbsp;${plain(data.itemTotalInPaise)}`)}
    ${data.discount ? row(escapeHtml(data.discount.label), `-${plain(data.discount.amountInPaise)}`) : ''}
    ${data.discount?.reason ? `<div>${escapeHtml(data.discount.reason)}</div>` : ''}
    ${taxes}
    <hr />
    ${roundOff}
    ${row('Grand Total', `₹ ${plain(data.billTotalInPaise)}`, 'big')}
    <hr />
    ${data.payments.map((payment) => row(`Paid: ${escapeHtml(payment.methodName)}`, plain(payment.amountInPaise))).join('')}
    ${data.accountName ? `<div>On Hold: ${escapeHtml(data.accountName)}</div>` : ''}
  </div>
  <div class="c foot">${escapeHtml(data.footerText ?? 'Thank you')}</div>
  ${qrSvg ? `<div class="review">${qrSvg}<div>Scan to review us</div></div>` : ''}
  <div class="feed"></div>
</div>`;
}
