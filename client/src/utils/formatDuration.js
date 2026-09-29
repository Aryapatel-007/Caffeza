/**
 * Whole minutes to a short "7h 20m" for display.
 *
 * The server stores and sends whole integer minutes (server/utils/time.js).
 * This is the only place the client turns that into words, the same rule as
 * formatDate.js: never in a component.
 */
export function formatMinutes(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) {
    return '—';
  }

  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
