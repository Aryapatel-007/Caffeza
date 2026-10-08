/**
 * The printer this device prints to, and the page each one needs. P25 Part C.
 *
 * Pure functions only, so a server test can import this file and check them,
 * the way P01 tested the client's business date mirror.
 *
 * Why `pageCss` exists: P05 wrote `@page { size: 80mm auto }`. `auto` is not a
 * length, and `size` takes one or two lengths or a keyword, so Chrome dropped
 * the whole rule, printed on the printer's own paper (A4, or Letter in a
 * headless browser) and the receipt came out as an 80 mm strip in the top
 * left corner. A thermal page is now always two lengths: the roll's width and
 * the receipt's measured height.
 */

export const PRINTERS = Object.freeze({
  THERMAL_80: Object.freeze({ label: 'Thermal, 80 mm', hint: 'A receipt printer with the wide roll. 48 characters a line.', thermal: true, widthMm: 80, characters: 48 }),
  THERMAL_58: Object.freeze({ label: 'Thermal, 58 mm', hint: 'A receipt printer with the narrow roll. 32 characters a line.', thermal: true, widthMm: 58, characters: 32 }),
  A4: Object.freeze({ label: 'A4', hint: 'An ordinary office printer. Bills print as a full-page tax invoice.', thermal: false, widthMm: 210, heightMm: 297, characters: 48 }),
  A5: Object.freeze({ label: 'A5', hint: 'Half an A4 sheet. Bills print as a full-page tax invoice.', thermal: false, widthMm: 148, heightMm: 210, characters: 48 }),
});

export const PRINTER_KEYS = Object.freeze(Object.keys(PRINTERS));
export const DEFAULT_PRINTER = 'THERMAL_80';

/** Space added under a measured receipt, so the cutter never takes the last line. */
export const THERMAL_FEED_MM = 4;
/** The margin of a full page, on every side. */
export const PAGE_MARGIN_MM = 12;

/** The printer for a device's saved settings. A device from before P25 saved `paperMm`. */
export function printerFor(settings = {}) {
  if (PRINTER_KEYS.includes(settings.printer)) return settings.printer;
  if (Number(settings.paperMm) === 58) return 'THERMAL_58';
  return DEFAULT_PRINTER;
}

/** Characters per line for text laid out on the server: receipts, KOTs, the Day Close. */
export function charactersFor(printer) {
  return (PRINTERS[printer] ?? PRINTERS[DEFAULT_PRINTER]).characters;
}

/** Millimetres from CSS pixels, at the 96 to the inch every browser uses for print. */
export const pxToMm = (px) => (px * 25.4) / 96;

/**
 * The `@page` rule for a printer. A thermal roll needs the content's height,
 * measured after layout, and gets a page exactly that tall plus the feed. A
 * full page is the paper's own size with 12 mm margins. Never `auto`.
 */
export function pageCss({ printer, contentHeightMm = null }) {
  const paper = PRINTERS[printer];
  if (!paper) throw new Error(`Unknown printer ${printer}.`);
  if (!paper.thermal) return `@page { size: ${printer}; margin: ${PAGE_MARGIN_MM}mm; }`;

  const height = Number(contentHeightMm);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error('A thermal page needs the measured height of what it prints.');
  }
  const pageHeight = Math.ceil(height) + THERMAL_FEED_MM;
  return `@page { size: ${paper.widthMm}mm ${pageHeight}mm; margin: 0; }`;
}

/**
 * The font size that makes `characters` monospace columns fill a width, in
 * millimetres. 0.6 em is the advance width of a typical monospace glyph. Text
 * on a full page is capped at a large, readable size.
 */
export function monospaceFontMm(printer) {
  const paper = PRINTERS[printer] ?? PRINTERS[DEFAULT_PRINTER];
  const printable = paper.thermal ? paper.widthMm - 4 : paper.widthMm - 2 * PAGE_MARGIN_MM;
  const fitted = printable / paper.characters / 0.6;
  return paper.thermal ? fitted : Math.min(fitted, 5);
}
