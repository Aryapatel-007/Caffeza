/**
 * Sends receipt text to the browser's print dialog.
 *
 * The server laid the text out already, at a fixed column width, in
 * server/services/receiptService.js. This function does no wrapping, no
 * padding and no layout of its own — API-CONTRACT.md section 15 is explicit
 * that the client prints what it is given, because a browser and a thermal
 * printer disagreeing about layout only ever shows up on paper, in a
 * restaurant.
 *
 * A separate window rather than styling the whole SPA for print: the app has
 * one layout, the receipt has a different, narrower one, and scoping a
 * print stylesheet across every screen this product has is more to get wrong
 * than opening a small window that prints one thing and closes.
 */
export function printReceiptText(text) {
  const printWindow = window.open('', '_blank', 'width=420,height=640');
  if (!printWindow) return;

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
<style>
  body { margin: 0; padding: 16px; background: #fff; }
  pre {
    font-family: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 13px;
    line-height: 1.35;
    white-space: pre;
    margin: 0;
  }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();

  // The content has to finish painting before print() is called, or some
  // browsers open a blank print preview.
  printWindow.onload = () => {
    printWindow.print();
  };
}
