/**
 * Sizes and "how long ago" for the backups on the Server card. P54.
 *
 * The one place the client turns bytes into words, beside formatDate.js and
 * formatDuration.js, never in a component.
 */
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "18 MB", "1.2 GB", "340 KB". */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= GB) return `${(value / GB).toFixed(value >= 10 * GB ? 0 : 1)} GB`;
  if (value >= MB) return `${Math.round(value / MB)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

/** Backblaze counts its free 10 GB in decimal gigabytes. */
export function formatDecimalGb(bytes) {
  return `${Math.round((Number(bytes) || 0) / 1e9)} GB`;
}

/** "3 minutes ago", "2 hours ago", "just now", from an instant. */
export function formatAgo(value, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}
