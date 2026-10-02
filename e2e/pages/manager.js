import { expect } from '@playwright/test';

import { typeOnKeypad } from './keypad.js';

/** The owner sets the invoice series on the Invoice numbers settings screen. */
export async function setInvoiceSeries(page, prefix, startingNumber, reason) {
  await page.goto('/settings');
  await page.getByText(/^Prefix, like/).click();
  await page.getByLabel('Prefix', { exact: true }).fill(prefix);
  await page.getByLabel('Starting number').fill(String(startingNumber));
  await page.getByLabel('Why are you changing this?').fill(reason);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

/** Day Close, blind: the manager counts, and a note when the count is off. */
export async function closeDay(page, businessDate, counted, note) {
  await page.goto(`/day-close?date=${businessDate}`);
  await expect(page.getByRole('heading', { name: 'Day Close', level: 1 })).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
  const form = page.getByText('Cash counted in the drawer').locator('xpath=..');
  await typeOnKeypad(form, counted);
  const close = page.getByRole('button', { name: /^Close / });
  await close.click();
  const noteField = page.getByLabel(/^Note, required/);
  await expect(noteField).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
  await noteField.fill(note);
  await close.click();
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
}
