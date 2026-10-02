/**
 * One clock for the server and every browser. P21.
 *
 * `at(time, date)` moves the server's clock through the e2e control listener,
 * then fixes `Date` on every page that has been opened, so the screens and the
 * server always agree on what time it is. Timers keep running.
 */
const CONTROL = 'http://127.0.0.1:5056';

/** Every page whose clock follows `at`. */
const pages = new Set();

let current = null;

/** India time on a date, as an instant. */
export const ist = (time, date = '2026-09-26') => new Date(`${date}T${time}:00+05:30`);

async function control(path, body) {
  const response = await fetch(`${CONTROL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Empties the database and sets up the golden restaurant. Returns phones and the password. */
export function resetGolden() {
  pages.clear();
  current = null;
  return control('/reset');
}

/** Puts a page on the shared clock, now and for every later `at`. */
export async function track(page) {
  pages.add(page);
  page.on('close', () => pages.delete(page));
  if (current) await page.clock.setFixedTime(current);
}

export async function at(time, date = '2026-09-26') {
  current = ist(time, date);
  await control('/clock', { at: current.toISOString() });
  for (const page of pages) await page.clock.setFixedTime(current);
  return current;
}
