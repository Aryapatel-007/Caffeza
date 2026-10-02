import { expect } from '@playwright/test';

import { typeOnKeypad } from './keypad.js';

export async function gotoBill(page, url) {
  await page.goto(url);
  await expect(page.getByText('Tax invoice')).toBeVisible();
}

/** The bill's number, as printed under "Tax invoice". */
export const billNumber = (page) => page.getByText('Tax invoice').locator('xpath=following-sibling::*[1]');

/** Manager. `{ percent }` uses a preset; `{ amount }` types a flat amount in rupees. */
export async function applyDiscount(page, { percent, amount, reason, note }) {
  await page.getByRole('button', { name: /^Apply discount/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Apply discount' });
  if (percent) {
    await sheet.getByRole('button', { name: new RegExp(`^${percent}%`) }).click();
  } else {
    await sheet.getByRole('button', { name: 'Amount off (₹)' }).click();
    await typeOnKeypad(sheet, amount);
  }
  await sheet.getByRole('button', { name: reason, exact: true }).click();
  if (note) await sheet.getByLabel(/^Note/).fill(note);
  await sheet.getByRole('button', { name: /^Apply discount/ }).click();
  await expect(sheet).toBeHidden();
}

/** Cashier. Each payment is `[method name, amount in rupees]`; the amount starts at what is owed. */
export async function pay(page, payments) {
  for (const [method, amount] of payments) {
    const area = page.getByRole('region', { name: 'Take payment' });
    await area.getByRole('button', { name: new RegExp(`^${method}`) }).click();
    const keypad = area.getByText(/^Amount received/).locator('xpath=..');
    await typeOnKeypad(keypad, amount);
    await keypad.getByRole('button', { name: /^Record payment/ }).click();
    await expect(page.getByText(/^Payment recorded/)).toBeVisible();
  }
}

/** The bill reads Paid, and its payments add up to `total`. */
export async function expectPaid(page, total) {
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('This bill is paid in full', { exact: false })).toBeVisible();
  await expect(page.getByText('Bill total').locator('xpath=..')).toContainText(total);
}

export async function chargeToAccount(page, account) {
  await page.getByRole('button', { name: 'Charge to account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Charge to account' });
  await sheet.getByRole('button', { name: new RegExp(`^${account}`) }).click();
  await sheet.getByRole('button', { name: `Charge to ${account}` }).click();
  await expect(page.getByText(`On Hold on ${account}`).first()).toBeVisible();
}

export async function voidBill(page, reason) {
  await page.getByRole('button', { name: /^Void bill/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Void bill' });
  await sheet.getByRole('button', { name: reason, exact: true }).click();
  await sheet.getByRole('button', { name: /^Void bill/ }).click();
  await expect(page.getByText('Voided', { exact: true }).first()).toBeVisible();
}

export async function printBill(page) {
  await page.getByRole('button', { name: /^Print bill/ }).click();
}
