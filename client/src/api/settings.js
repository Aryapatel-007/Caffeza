/**
 * Settings API calls. Shapes from docs/API-CONTRACT.md section M7.
 *
 * Two calls, because there are two endpoints. Reading is OWNER and MANAGER;
 * writing is OWNER only, and the server is what enforces that.
 *
 * The patch sends only what changed, plus the reason. Sending the whole object
 * back would be harmless but would fill the audit log with lines saying a field
 * was set to the value it already had, which makes the real change harder to
 * find later. `changedSettings` below is what keeps that honest.
 */
import { api } from './client.js';

export function getSettings() {
  return api.get('/settings');
}

/**
 * `patch` is the changed groups only. `reason` is required by the server and
 * is not defaulted to anything, here or there.
 */
export function updateSettings({ reason, ...patch }) {
  return api.patch('/settings', { reason, ...patch });
}

/**
 * The difference between what was loaded and what is on screen, in the shape
 * the endpoint takes.
 *
 * Returns an empty object when nothing moved, which the form reads as "there is
 * nothing to save" rather than sending a patch the server would reject.
 */
export function changedSettings(original, current) {
  const patch = {};

  for (const group of Object.keys(current)) {
    for (const [field, value] of Object.entries(current[group])) {
      if (value === original?.[group]?.[field]) continue;
      patch[group] ??= {};
      patch[group][field] = value;
    }
  }

  return patch;
}
