/**
 * Time and date labels for report screens. Money is `Money`'s job, including
 * the short axis-tick form, `compactMoneyText`.
 */

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

