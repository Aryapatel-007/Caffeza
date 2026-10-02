/**
 * A single-series horizontal bar chart for ranked categories, in inline SVG.
 *
 * Horizontal because the categories here have long names -- dish names,
 * ingredient names, staff names -- and a vertical column forces those into a
 * rotated axis label nobody reads.
 *
 * ONE COLOUR FOR EVERY BAR, never darker-where-bigger. A value ramp on nominal
 * categories double-encodes bar length as hue: it spends the only free channel
 * on information the length already shows. The bar's length is the magnitude;
 * the colour says nothing and is therefore `ink`, per DESIGN-SYSTEM section 3.
 *
 * The value IS labelled on each row here, unlike the column chart. That is not
 * a contradiction of "never a number on every point": a ranked bar list is
 * closer to a table than to a plot -- there are at most a handful of rows, each
 * on its own line with room to its right, and the number is the thing being
 * ranked. Flooding applies to dense plots, not to ten labelled rows.
 */
/**
 * 14px, not the 24px a column gets. A ranked bar runs the full width of the
 * row, and at 20px a near-black block that long reads loud -- the "thick
 * saturated blocks" failure. Thin marks; the data is the only thing allowed
 * to be loud, and here the data is the length.
 */
const BAR_HEIGHT = 14;
const ROW_HEIGHT = 40;
const CAP_RADIUS = 4;

export default function RankedBars({
  data,
  valueKey = 'value',
  labelKey = 'label',
  formatValue = (value) => String(value),
  secondaryKey = null,
  formatSecondary = (value) => String(value),
  emptyMessage = 'Nothing in this range.',
}) {
  const rows = data ?? [];
  const max = Math.max(0, ...rows.map((row) => row[valueKey] ?? 0));

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border-2 border-dashed border-muted px-4 py-8 text-center type-caption text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="m-0 list-none p-0">
      {rows.map((row, index) => {
        const value = row[valueKey] ?? 0;
        const widthPercent = max > 0 ? (value / max) * 100 : 0;

        return (
          <li
            key={row[labelKey] ?? index}
            className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
            style={{ minHeight: ROW_HEIGHT }}
          >
            <span className="w-28 shrink-0 truncate type-caption sm:w-40" title={row[labelKey]}>
              {row[labelKey]}
            </span>

            <span className="relative flex-1" style={{ height: BAR_HEIGHT }}>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 block rounded-r-[4px] bg-ink"
                style={{ width: `${widthPercent}%`, borderRadius: `0 ${CAP_RADIUS}px ${CAP_RADIUS}px 0` }}
              />
            </span>

            <span className="w-24 shrink-0 text-right type-num-meta tabular-nums sm:w-28">
              {formatValue(value)}
            </span>

            {secondaryKey && (
              <span className="w-20 shrink-0 text-right type-num-meta tabular-nums text-muted">
                {formatSecondary(row[secondaryKey] ?? 0)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
