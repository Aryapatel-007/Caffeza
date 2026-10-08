/**
 * P23, online takeaway and a booking, through the real screens.
 *
 * A guest on a phone orders from the restaurant's page; the cashier's tablet
 * shows the banner and says it aloud (a spy records the spoken line, since a
 * headless browser has no speakers); the cashier accepts; the Beverages
 * station gets the ticket; the guest's page reads Confirmed. Then a booking:
 * requested on the page, confirmed on Table 5, shown as Reserved on the floor,
 * and seated, which opens the table's order.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden, track } from './helpers/clock.js';
import { DEVICES, signIn } from './helpers/people.js';
import { openStation } from './pages/kitchen.js';

const DAY = '2026-09-26';
const APP = 'http://127.0.0.1:5055/api/v1';

async function api(method, path, token, body) {
  const response = await fetch(`${APP}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(parsed)}`);
  return parsed.data;
}

/** Records every spoken line instead of saying it. */
async function spyOnSpeech(person) {
  await person.context.addInitScript(() => {
    window.__spoken = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance) => window.__spoken.push(utterance.text);
    }
  });
  await person.page.reload();
}

const spoken = (person) => person.page.evaluate(() => window.__spoken ?? []);

/** A dish's row on the public menu, and its Add button. */
const addDish = (page, name) =>
  page.getByText(name, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').getByRole('button', { name: 'Add' }).click();

test.describe.configure({ mode: 'serial' });

test('online takeaway and a booking, through the screens', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);

  // The owner switches it on, as they would in Settings.
  const owner = await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password });
  await api('PATCH', '/settings', owner.accessToken, {
    reason: 'Start online orders',
    features: { online: true },
    online: { takeawayEnabled: true, reservationsEnabled: true },
  });
  await api('PATCH', '/online/site', owner.accessToken, { publicSlug: 'cafezza' });

  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  await spyOnSpeech(cashier);
  await cashier.page.goto('/floor');
  // Browsers allow sound only after a tap.
  await cashier.page.mouse.click(5, 5);

  // A guest on a phone, not signed in.
  const guestContext = await browser.newContext(DEVICES.phone);
  const guest = await guestContext.newPage();
  await track(guest);
  await guest.goto('/r/cafezza');
  await guest.getByRole('link', { name: /Order takeaway/ }).click();
  await addDish(guest, 'Masala Tea');
  await addDish(guest, 'Caffe Latte');
  await guest.getByRole('button', { name: 'Review order' }).click();
  await expect(guest.getByText('Estimated bill total')).toBeVisible();
  await guest.getByLabel('Your name').fill('Asha');
  await guest.getByLabel('Mobile number').fill('9876543210');
  await guest.getByRole('button', { name: 'Place order' }).click();
  await expect(guest.getByRole('heading', { name: 'Order W-1' })).toBeVisible();
  await expect(guest.getByText('Waiting for the cafe to confirm')).toBeVisible();

  // The cashier hears it and sees it.
  const banner = cashier.page.getByRole('status').filter({ hasText: 'online request' });
  await expect(banner).toContainText('1 online request waiting', { timeout: 30_000 });
  await expect.poll(() => spoken(cashier), { timeout: 10_000 }).toContainEqual('New takeaway order, W 1, 2 items, pickup 1 20 PM.');

  await banner.getByRole('link', { name: 'Open' }).click();
  await expect(cashier.page).toHaveURL(/\/online$/);
  await cashier.page.getByRole('button', { name: 'Accept' }).click();
  await cashier.page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(cashier.page.getByText(/W-1 accepted as order \d+ and sent to the kitchen/)).toBeVisible();
  await expect(banner).toHaveCount(0);

  // The drinks station has the ticket.
  const beverages = await signIn(browser, { name: 'Beverages', phone: golden.phones.Manager, password: golden.password, device: 'tablet' });
  await openStation(beverages.page, 'Beverages');
  await expect(beverages.page.getByText('Masala Tea')).toBeVisible();
  await expect(beverages.page.getByText('Caffe Latte')).toBeVisible();

  // The guest's page follows.
  await expect(guest.getByText('Confirmed', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByText(/Ready at 1:20 pm/i)).toBeVisible();

  // A booking for four at 8 PM.
  await guest.goto('/r/cafezza/book');
  await guest.getByRole('button', { name: 'One more' }).click();
  await guest.getByRole('button', { name: 'One more' }).click();
  await guest.getByRole('button', { name: /^8:00 pm$/i }).click();
  await guest.getByLabel('Your name').fill('Mehta');
  await guest.getByLabel('Mobile number').fill('9123456789');
  await guest.getByRole('button', { name: 'Request booking' }).click();
  await expect(guest.getByRole('heading', { name: 'Booking R-1' })).toBeVisible();

  await expect(banner).toContainText('1 online request waiting', { timeout: 30_000 });
  await expect.poll(() => spoken(cashier), { timeout: 10_000 }).toContainEqual(expect.stringMatching(/^New table booking, R 1, 4 people, Saturday 8 00 PM\.$/));

  await cashier.page.goto('/online/bookings');
  await cashier.page.getByRole('button', { name: 'Confirm' }).click();
  const confirmSheet = cashier.page.getByRole('dialog');
  await confirmSheet.getByLabel('Table').selectOption({ label: 'Table 5' });
  await confirmSheet.getByRole('button', { name: 'Confirm' }).click();
  await expect(cashier.page.getByText('R-1 confirmed.')).toBeVisible();

  // Ten to eight: the floor shows the table as reserved, and seats the booking.
  await at('19:50', DAY);
  await cashier.page.goto('/floor');
  const table5 = cashier.page.getByRole('button', { name: /^Table 5, reserved at 8:00 pm, seat guests$/i });
  await expect(table5).toBeVisible();
  await expect(table5).toContainText(/Reserved 8:00 pm, 4/i);
  await table5.click();
  await cashier.page.getByRole('dialog').getByRole('button', { name: 'Seat R-1, 4 guests' }).click();
  await expect(cashier.page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);

  await guestContext.close();
});
