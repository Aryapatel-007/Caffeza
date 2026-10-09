import { expect } from '@playwright/test';

import { addFromPanel, addItems, sendToKitchen } from './order.js';

/** A platform order typed in from the platform's tablet, sent to the kitchen. Returns the order's address. */
export async function newDelivery(page, platform, platformOrderId, items) {
  await page.goto('/orders/delivery');
  await page.getByRole('button', { name: new RegExp(`^${platform}`) }).click();
  await page.getByLabel('Platform order number').fill(platformOrderId);
  for (const item of items) {
    await page.getByRole('button', { name: `Add ${item}`, exact: true }).click();
    await addFromPanel(page);
  }
  await page.getByRole('button', { name: /^Send to kitchen/ }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);
  return page.url();
}

/** A takeaway order with its dishes, sent to the kitchen. Returns the order's address. */
export async function newTakeaway(page, items) {
  await page.goto('/orders/takeaway');
  await page.getByRole('button', { name: 'Start the order' }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);
  await addItems(page, items);
  await sendToKitchen(page);
  return page.url();
}

/**
 * The opening float, an expense or a top-up, on the cash book. P29 Part F.
 * `amount` is `[[rupees, count], ...]` notes for the float, or a typed amount.
 * An expense (P29's word for a paid out) goes in `category`, default Milk and
 * dairy, with `reason` as its note.
 */
export async function recordCash(page, type, amount, reason = null, { category = 'Milk and dairy', source = 'From the owner' } = {}) {
  const { countNotes } = await import('./manager.js');
  const { typeOnKeypad } = await import('./keypad.js');
  await page.goto('/cash-book');
  await expect(page.getByRole('heading', { name: 'Cash book', level: 1 })).toBeVisible();
  if (type === 'Opening float') {
    await page.getByRole('button', { name: 'Count the float' }).click();
    const sheet = page.getByRole('dialog', { name: 'Opening float' });
    await countNotes(sheet, amount);
    await sheet.getByRole('button', { name: /^Start with/ }).click();
    await expect(page.getByText('Opening float recorded.')).toBeVisible();
    return;
  }
  const isExpense = type === 'Paid out' || type === 'Expense';
  await page.getByRole('button', { name: isExpense ? '− Expense' : '+ Top-up' }).click();
  const sheet = page.getByRole('dialog', { name: isExpense ? 'Expense' : 'Top-up' });
  await sheet.getByRole('button', { name: isExpense ? category : source, exact: true }).click();
  await typeOnKeypad(sheet, amount);
  if (reason) await sheet.getByLabel(/^Note/).fill(reason);
  await sheet.getByRole('button', { name: isExpense ? /^Record ₹/ : /^Add ₹/ }).click();
  await expect(page.getByText(isExpense ? 'Expense recorded.' : 'Top-up recorded.')).toBeVisible();
}

/** A collection against an On Hold account. */
export async function recordCollection(page, account, method, amount) {
  await page.goto('/accounts');
  await page.getByRole('button', { name: new RegExp(`^${account}`) }).click();
  const form = page.getByText('Record collection', { exact: true }).first().locator('xpath=..');
  await form.getByRole('button', { name: method, exact: true }).click();
  await form.getByLabel(/^Amount, up to/).fill(amount);
  await form.getByRole('button', { name: 'Record collection' }).click();
}
