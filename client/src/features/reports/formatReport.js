/**
 * Number formatting for report screens.
 *
 * `formatPaise` in utils/formatMoney.js stays the one place paise become a
 * rupee label everywhere in the product. These are additions for the one
 * thing a report needs and no other screen does: an axis tick, where the full
 * "₹1,28,400.00" is far too long to sit under a column.
 */
import { formatPaise } from '../../utils/formatMoney.js';

const PAISE_PER_RUPEE = 100;

/**
 * A short rupee label for an axis tick, in Indian units.
 *
 * Lakh and crore rather than K and M, because this reads to a restaurant
 * owner in Ahmedabad and "1.2L" is the form they already use. Rounded hard on
 * purpose: an axis tick is orientation, not a figure anyone should quote. The
 * exact number is in the tooltip and in the table view underneath.
 */
export function compactPaise(paise) {
  if (!Number.isInteger(paise)) return '';
  const rupees = paise / PAISE_PER_RUPEE;
  const sign = rupees < 0 ? '-' : '';
  const value = Math.abs(rupees);

  if (value >= 10_000_000) return `${sign}₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${sign}₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000) return `${sign}₹${(value / 1_000).toFixed(1)}K`;
  return `${sign}₹${Math.round(value)}`;
}

/** Whole minutes as "7h 20m". Mirrors utils/formatDuration.js's shape. */
export function formatMinutes(minutes) {
  if (!Number.isInteger(minutes)) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

/** "2026-08-30" as "30 Aug". Business dates are labels, so this only reformats a string. */
export function shortBusinessDate(businessDate) {
  const [, month, day] = businessDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${months[Number(month) - 1]}`;
}

/** "20" as "8pm". For the hourly chart's axis. */
export function hourLabel(hourIst) {
  if (hourIst === 0) return '12am';
  if (hourIst === 12) return '12pm';
  return hourIst < 12 ? `${hourIst}am` : `${hourIst - 12}pm`;
}

export { formatPaise };
