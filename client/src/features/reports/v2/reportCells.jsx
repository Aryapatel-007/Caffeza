import { formatBusinessDate, formatTimeIst } from '../../../utils/formatDate.js';
import { formatBasisPoints } from '../../../utils/formatMoney.js';
import { moneyText } from '../../../components/ui/Money.jsx';

/**
 * One report cell, by its column type. M19, P14. Contract section 3.
 *
 * Money is ₹ with Indian grouping; a negative amount is shown with its minus
 * sign in `alert`. Shared by every M19 screen, so a column type reads the same
 * on every report.
 */
export function formatCell(type, value) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
      return moneyText(value);
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
    <span className={[numeric ? 'font-mono tabular-nums' : '', negative ? 'text-alert' : ''].join(' ')}>{formatCell(type, value)}</span>
  );
}

/** "26 Sep is still open. These numbers will change until Day Close." */
export function OpenDaysBanner({ openDays }) {
  if (!openDays?.length) return null;
  const names = openDays.map((date) => formatBusinessDate(date).replace(/ \d{4}$/, ''));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return (
    <p className="type-body rounded-r-[10px] border border-line border-l-[3px] border-l-open bg-surface px-3 py-2">
      {list} {names.length === 1 ? 'is' : 'are'} still open. These numbers will change until Day Close.
    </p>
  );
}

