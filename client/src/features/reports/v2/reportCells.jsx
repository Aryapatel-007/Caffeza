import { formatBusinessDate, formatTimeIst } from '../../../utils/formatDate.js';
import { formatBasisPoints, formatPaise } from '../../../utils/formatMoney.js';

/**
 * One report cell, by its column type. M19, P14. Contract section 3.
 *
 * Money is ₹ with Indian grouping; a negative amount is shown with its minus
 * sign in `mirch`. Shared by every M19 screen, so a column type reads the same
 * on every report.
 */
export function formatCell(type, value) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
      return formatPaise(value);
    case 'count':
      return new Intl.NumberFormat('en-IN').format(value);
    case 'percent':
      return formatBasisPoints(value);
    case 'date':
      return formatBusinessDate(value);
    case 'time':
      return formatTimeIst(value);
    case 'minutes':
      return `${value} min`;
    case 'decimal2':
      return (value / 100).toFixed(2);
    default:
      return String(value);
  }
}

export function Cell({ type, value }) {
  const numeric = type === 'money' || type === 'count' || type === 'percent' || type === 'decimal2' || type === 'minutes';
  const negative = type === 'money' && typeof value === 'number' && value < 0;
  return (
    <span className={[numeric ? 'font-mono' : '', negative ? 'text-mirch' : ''].join(' ')}>{formatCell(type, value)}</span>
  );
}

/** "26 Sep is still open. These numbers will change until Day Close." */
export function OpenDaysBanner({ openDays }) {
  if (!openDays?.length) return null;
  const names = openDays.map((date) => formatBusinessDate(date).replace(/ \d{4}$/, ''));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return (
    <p className="rounded-xl border border-black/5 shadow-card px-3 py-2 text-[13px] leading-[18px]">
      {list} {names.length === 1 ? 'is' : 'are'} still open. These numbers will change until Day Close.
    </p>
  );
}

/**
 * Green when every check passed; otherwise each failed check's message, red
 * for an error and amber for a warning, with links to the records behind it.
 * The strip never hides the report under it.
 */
export function CheckStrip({ checks, onOpenRefs, renderRefs }) {
  if (!checks?.length) return null;
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return (
      <p className="rounded-xl border-2 border-patta bg-patta-tint px-3 py-2 text-[13px] leading-[18px] text-ink">
        ✓ {checks.length === 1 ? 'The 1 check passed.' : `All ${checks.length} checks passed.`}
      </p>
    );
  }
  return (
    <ul className="grid gap-1">
      {failed.map((check) => (
        <li
          key={check.id}
          className={[
            'rounded-xl border-2 px-3 py-2 text-[13px] leading-[18px]',
            check.severity === 'ERROR' ? 'border-mirch bg-mirch-soft text-mirch' : 'border-chana bg-chana-soft text-ink',
          ].join(' ')}
        >
          {check.severity === 'ERROR' ? '✕ ' : '! '}
          {check.message}
          {renderRefs
            ? renderRefs(check)
            : check.refs?.length > 0 &&
              onOpenRefs && (
                <button type="button" onClick={() => onOpenRefs(check)} className="ml-2 underline">
                  Show the bills
                </button>
              )}
        </li>
      ))}
    </ul>
  );
}
