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

/**
 * P25 Part F. Counts notes and coins on a CashCounter: `notes` is a list of
 * `[rupees, count]`, like `[[500, 6], [200, 2]]`, all notes.
 */
export async function countNotes(scope, notes) {
  for (const [rupees, count] of notes) {
    await scope.getByLabel(`How many note of ₹${rupees.toFixed(2)}`).fill(String(count));
  }
}

/**
 * Day Close, blind, from the cash book (P29 Part F): the manager counts by
 * notes, keeps the usual float for tomorrow, the rest goes to the bank, and a
 * note when the count is off. Nothing on screen says what the drawer should hold.
 */
export async function closeDay(page, businessDate, notes, note) {
  await page.goto(`/cash-book?date=${businessDate}&close=1`);
  const sheet = page.getByRole('dialog', { name: /^Close / });
  await expect(sheet).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
  await countNotes(sheet.getByRole('region', { name: 'Cash counted in the drawer' }), notes);
  const close = sheet.getByRole('button', { name: 'Close the day' });
  await close.click();
  const noteField = sheet.getByLabel(/^Note, required/);
  await expect(noteField).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
  await noteField.fill(note);
  await close.click();
  await expect(page.getByText(/is closed\.$/)).toBeVisible();
  await expect(page.getByText('Expected cash')).toHaveCount(0);
}
