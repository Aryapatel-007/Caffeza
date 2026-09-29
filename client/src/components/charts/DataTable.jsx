/**
 * A plain data table.
 *
 * Two jobs. It is the right form on its own wherever a row carries several
 * numbers at once -- a tax slab has a taxable value, CGST, SGST and a total,
 * and no chart shows four measures per category honestly. It is also the
 * TABLE-VIEW TWIN that sits under every chart, so no value is reachable only
 * by hovering: a tooltip enhances, it never gates.
 *
 * `tabular-nums` on every numeric cell, which is exactly where it belongs --
 * columns of figures that must align vertically. The large standalone numbers
 * in StatTile deliberately do not use it.
 */
export default function DataTable({ columns, rows, emptyMessage = 'Nothing in this range.', caption }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="rounded-[10px] border-2 border-dashed border-steel/40 px-4 py-8 text-center text-[13px] text-steel">
        {emptyMessage}
      </p>
    );
  }

  return (
    // Wide tables scroll inside their own container rather than pushing the
    // page sideways.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b-2 border-ink">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-2 py-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel ${
                  column.numeric ? 'text-right' : 'text-left'
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key ?? index} className="border-b border-steel/15 last:border-b-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-2 py-2 leading-[18px] ${
                    column.numeric ? 'text-right font-mono tabular-nums' : 'text-left'
                  }`}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
