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
 * names this file as the one exception.
 */
import { moneyText } from '../../components/ui/Money.jsx';

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
