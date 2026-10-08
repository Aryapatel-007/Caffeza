/**
 * Prints from the browser. P05, rebuilt in P25 Part C.
 *
 * Used for bills, KOTs and the Day Close. The server has already laid text out
 * at a fixed column width (receiptService.js, kotTicketService.js); this does
 * no wrapping, padding or column arithmetic of its own.
 *
 * Everything prints from a hidden iframe, never the whole page. The frame is
 * given the paper's real width so the content lays out exactly as it will
 * print, then its height is measured, and only then is the `@page` rule
 * written, from `pageCss` in printers.js: a thermal page exactly the
 * receipt's height, or a full A4 or A5 page. With Chrome started with
 * --kiosk-printing (docs/DEPLOYMENT.md section 10) the print goes straight to
 * the default printer with no dialog; without it the print dialog opens.
 *
 * The server never talks to a printer. This is the only path to paper.
 */
import { charactersFor, monospaceFontMm, PAGE_MARGIN_MM, pageCss, PRINTERS, pxToMm } from './printers.js';

export { charactersFor };

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Lets the frame's content paint before measuring or printing. */
const nextFrame = (win) => new Promise((resolve) => win.requestAnimationFrame(() => setTimeout(resolve, 30)));

/**
 * Prints an HTML body on this device's printer. `bodyHtml` is trusted markup
 * built by this folder; every value in it was escaped by its builder.
 * Resolves once print() has been called; rejects if the browser refused, so a
 * caller can say "Not printed" rather than believing it worked.
 */
export async function printDocument({ printer: chosen, bodyHtml, styles = '' }) {
  const printer = PRINTERS[chosen] ? chosen : 'THERMAL_80';
  const paper = PRINTERS[printer];
  const contentWidthMm = paper.thermal ? paper.widthMm : paper.widthMm - 2 * PAGE_MARGIN_MM;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${contentWidthMm}mm`,
    height: '2000mm',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(frame);
  const cleanUp = () => setTimeout(() => frame.remove(), 1000);

  try {
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Print</title>
<style>
  html, body { margin: 0; padding: 0; background: white; color: black; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${styles}
</style></head><body><div id="print-root">${bodyHtml}</div></body></html>`);
    doc.close();
    await nextFrame(frame.contentWindow);

    const heightMm = pxToMm(doc.getElementById('print-root').getBoundingClientRect().height);
    const page = doc.createElement('style');
    page.textContent = pageCss({ printer, contentHeightMm: heightMm });
    doc.head.appendChild(page);
    await nextFrame(frame.contentWindow);

    frame.contentWindow.focus();
    frame.contentWindow.print();
  } finally {
    cleanUp();
  }
}

/** The styles for server-laid text: a roll's full width, or a large block at the top of a page. */
export function textStyles(printer) {
  const paper = PRINTERS[printer] ?? PRINTERS.THERMAL_80;
  return `
  pre {
    margin: 0;
    padding: ${paper.thermal ? '2mm' : '0'};
    font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: ${monospaceFontMm(printer).toFixed(2)}mm;
    line-height: 1.25;
    white-space: pre;
  }
  .review { display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 2mm 0 4mm; font: 3mm sans-serif; }
  .review svg { width: 30mm; height: 30mm; }`;
}

/**
 * Prints server-laid text: a receipt, a KOT or the Day Close. On a thermal
 * roll it fills the roll's width; on A4 or A5 it prints as one large block at
 * the top of the page. `afterHtml` (the review QR code) goes under it.
 */
export function printText(text, printer, { afterHtml = '' } = {}) {
  // P21. The browser tests record what would print instead of printing. Only a
  // test's init script ever sets this; nothing in the app does.
  if (typeof window.__E2E_PRINT__ === 'function') {
    window.__E2E_PRINT__(text, printer);
    return Promise.resolve();
  }
  return printDocument({ printer, bodyHtml: `<pre>${escapeHtml(text)}</pre>${afterHtml}`, styles: textStyles(printer) });
}

export { escapeHtml };
