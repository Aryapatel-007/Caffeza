/**
 * Prints one bill on this device's printer. P25 Part C.
 *
 * A thermal printer prints the server's receipt text, with the review link's
 * QR code under it. A4 and A5 print the full-page tax invoice, laid out from
 * the same data. The bill screen, the receipt preview and the counter's
 * print queue all print through here, so a bill looks the same whoever prints
 * it.
 */
import QRCode from 'qrcode';

import { getInvoice, getReceipt } from '../../api/bills.js';

import { INVOICE_STYLES, invoiceHtml } from './invoiceHtml.js';
import { charactersFor, PRINTERS } from './printers.js';
import { printDocument, printText } from './printText.js';

/** The review link as an SVG QR code, or null. Built here, never fetched. */
export function reviewQrSvg(url) {
  if (!url) return Promise.resolve(null);
  return QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
}

export async function printBill(billId, { printer, logoDataUrl = null }) {
  if (PRINTERS[printer]?.thermal === false) {
    const data = await getInvoice(billId);
    const qrSvg = await reviewQrSvg(data.reviewLinkUrl);
    return printDocument({ printer, bodyHtml: invoiceHtml(data, { qrSvg, logoDataUrl }), styles: INVOICE_STYLES });
  }
  const receipt = await getReceipt(billId, charactersFor(printer));
  // The text already ends "Scan to review us"; the code itself is drawn here.
  const svg = await reviewQrSvg(receipt.reviewLinkUrl);
  return printText(receipt.text, printer, { afterHtml: svg ? `<div class="review">${svg}</div>` : '' });
}
