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

/** Opening float, paid in or paid out, on the cash drawer. */
export async function recordCash(page, type, amount, reason = null) {
  await page.goto('/cash');
  const form = page.getByRole('heading', { name: 'Record cash' }).locator('xpath=..');
  await form.getByRole('button', { name: type, exact: true }).click();
  const { typeOnKeypad } = await import('./keypad.js');
  await typeOnKeypad(form, amount);
  if (reason) await form.getByLabel('What for, required').fill(reason);
  await form.getByRole('button', { name: `Record ${type.toLowerCase()}` }).click();
  await expect(page.getByText(`${type} recorded.`)).toBeVisible();
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
