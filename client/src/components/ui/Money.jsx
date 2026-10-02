/**
 * Paise shown as rupees. DESIGN-SYSTEM-V2 section 9: the only place a
 * component formats money.
 *
 * Plex Mono, Indian grouping, two decimals, a minus sign and `alert` when
 * negative. The figure is a label and never goes back into arithmetic: a
 * screen adds paise and shows the sum, never the reverse.
 *
 * `moneyText` is the same words as plain text, for the few places a string is
 * required rather than an element: an aria-label, a confirmation sentence
 * passed to a toast, a button whose label is one sentence.
 */
const GROUPING = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function moneyText(paise, { symbol = true } = {}) {
  if (!Number.isInteger(paise)) return '';
  const sign = paise < 0 ? '-' : '';
  const rupees = GROUPING.format(Math.abs(paise) / 100);
  return symbol ? `${sign}₹${rupees}` : `${sign}${rupees}`;
}

const STYLES = {
  num: 'type-num',
  tile: 'type-num-tile',
  hero: 'type-num-hero',
  meta: 'type-num-meta',
  inherit: 'font-mono',
};

/**
 * `size`: `num` for rows, `tile` on tiles, `hero` for a bill total or a
 * keypad display, `meta` for small figures, `inherit` to keep the caller's size.
 * `tabular` lines a column of figures up; a standalone hero figure leaves it off.
 * `blank` is shown when there is no figure, rather than an empty gap.
 */
export default function Money({ paise, size = 'inherit', tabular = false, symbol = true, signed = true, blank = '—', className = '' }) {
  if (!Number.isInteger(paise)) {
    return <span className={`${STYLES[size] ?? STYLES.inherit} text-muted ${className}`}>{blank}</span>;
  }
  const negative = signed && paise < 0;
  return (
    <span
      className={[
        STYLES[size] ?? STYLES.inherit,
        tabular ? 'tabular-nums' : '',
        negative ? 'text-alert' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {moneyText(paise, { symbol })}
    </span>
  );
}
