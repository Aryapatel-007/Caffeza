/**
 * Prints a block of plain text on a thermal roll, from the browser. P05.
 *
 * Used for both bills and KOTs. The server has already laid the text out at a
 * fixed column width (receiptService.js, kotTicketService.js); this does no
 * wrapping, padding or column arithmetic of its own.
 *
 * It writes the text into a hidden iframe as a <pre>, sized for 58mm or 80mm
 * paper, with the restaurant's logo above it when `logo` is given (bills, not
 * kitchen tickets), and calls print() on that iframe only, never on the whole page. With
 * Chrome started with --kiosk-printing (docs/DEPLOYMENT.md section 10) the
 * print goes straight to the default printer with no dialog. Without the flag,
 * the normal print dialog opens.
 *
 * The server never talks to a printer. This is the only path to paper.
 */

/** 32 characters across 58mm paper, 48 across 80mm. */
const PAPER = {
  58: { characters: 32, widthMm: 58 },
  80: { characters: 48, widthMm: 80 },
};

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Resolves when the print call has been made. Rejects if the browser refused,
 * so a caller can show "Not printed" rather than believing it worked.
 */
export function printText(text, paperMm = 80, { logo = null } = {}) {
  // P21. The browser tests record what would print instead of printing. Only a
  // test's init script ever sets this; nothing in the app does.
  if (typeof window.__E2E_PRINT__ === 'function') {
    window.__E2E_PRINT__(text, paperMm, { logo: Boolean(logo) });
    return Promise.resolve();
  }

  const paper = PAPER[paperMm] ?? PAPER[80];

  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.right = '0';
    frame.style.bottom = '0';
    document.body.appendChild(frame);

    const cleanUp = () => setTimeout(() => frame.remove(), 1000);

    try {
      const doc = frame.contentWindow.document;
      // A monospace font sized so `characters` columns fill the printable width.
      // 0.6em is the advance width of a typical monospace glyph.
      const fontMm = (paper.widthMm - 4) / paper.characters / 0.6;
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Print</title>
<style>
  @page { size: ${paper.widthMm}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  pre {
    margin: 0;
    padding: 2mm;
    font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: ${fontMm.toFixed(2)}mm;
    line-height: 1.25;
    white-space: pre;
    color: black;
  }
  img { display: block; width: 60%; margin: 2mm auto 0; }
</style></head><body>${logo ? `<img src="${logo}" alt="" />` : ''}<pre>${escapeHtml(text)}</pre></body></html>`);
      doc.close();

      // The logo has to be in before the page prints, or paper gets a blank space.
      const image = doc.querySelector('img');
      const ready = new Promise((done) => {
        if (!image || image.complete) return done();
        image.addEventListener('load', done, { once: true });
        // A logo that will not load must never stop the bill from printing.
        image.addEventListener('error', done, { once: true });
      });

      // Let the content paint before printing, or some browsers print a blank page.
      ready.then(() => setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          cleanUp();
        }
      }, 50));
    } catch (error) {
      cleanUp();
      reject(error);
    }
  });
}

/** The character width the server should lay text out at, for a paper size. */
export function charactersFor(paperMm) {
  return (PAPER[paperMm] ?? PAPER[80]).characters;
}
