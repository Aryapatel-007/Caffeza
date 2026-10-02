/**
 * A grid of shaded cells: one row per label, one column per bucket. P18, for
 * R4's weekday by hour. The only chart here that needed a new component: no
 * existing one shows two dimensions at once.
 *
 * One hue, `ink`, at an opacity from the cell's value over the largest, so the
 * busiest hour of the week is darkest. The exact figure is in each cell's
 * title and in the table underneath, so no number is reachable only by
 * hovering, and colour is never the only way to read it.
 */
export default function HeatGrid({ rows, rowKey, buckets, formatValue, caption }) {
  const values = rows.flatMap((row) => buckets.map((bucket) => row[bucket.key] ?? 0));
  const max = Math.max(0, ...values);

  return (
    <figure className="m-0 overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[11px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-white" />
            {buckets.map((bucket) => (
              <th key={bucket.key} scope="col" className="px-0.5 text-center font-mono font-normal text-steel">
                {bucket.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              <th scope="row" className="sticky left-0 bg-white pr-2 text-left font-medium">
                {row[rowKey].slice(0, 3)}
              </th>
              {buckets.map((bucket) => {
                const value = row[bucket.key] ?? 0;
                const strength = max > 0 ? value / max : 0;
                return (
                  <td
                    key={bucket.key}
                    title={`${row[rowKey]} ${bucket.label}: ${formatValue(value)}`}
                    className="h-6 w-6 min-w-6 rounded-[3px]"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--color-ink) ${value > 0 ? Math.round(8 + strength * 85) : 3}%, transparent)`,
                    }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
