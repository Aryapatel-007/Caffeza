import { expect } from '@playwright/test';

/** A dish card on the order screen. */
const card = (page, item) => page.locator('li').filter({ has: page.getByRole('heading', { name: item, exact: true, level: 3 }) });

/**
 * Adds dishes one tap at a time, in order. `[name, quantity]` raises the
 * quantity on the card. The order screen merges a second tap on a dish that
 * has an unsent line into that line, so a dish listed again on the timeline as
 * its own line is sent first and then added again, which makes it a new line.
 */
export async function addItems(page, items) {
  const unsent = new Set();
  for (const entry of items) {
    const [item, quantity] = Array.isArray(entry) ? entry : [entry, 1];
    if (unsent.has(item)) {
      await sendToKitchen(page);
      unsent.clear();
    }
    await page.getByRole('button', { name: `Add ${item}`, exact: true }).click();
    const stepper = card(page, item).getByRole('button', { name: 'One more' });
    await expect(stepper).toBeVisible();
    for (let more = 1; more < quantity; more += 1) {
      await stepper.click();
      await expect(card(page, item).locator('[aria-live="polite"]')).toHaveText(String(more + 1));
    }
    unsent.add(item);
  }
}

export async function sendToKitchen(page) {
  await page.getByRole('button', { name: /^Send \d+ to (the )?kitchen/ }).filter({ visible: true }).first().click();
  await expect(page.getByText('Sent to the kitchen.')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
}

/** The lines and the order's own actions: a sheet on a table's order, the panel beside a counter order. */
async function details(page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const sheet = page.getByRole('dialog', { name: /^Table/ });
  if (await sheet.isVisible().catch(() => false)) return sheet;
  const aside = page.getByRole('complementary', { name: 'This order' });
  if (await aside.isVisible().catch(() => false)) return aside;
  const summary = page.getByRole('button', { name: /Item total, before GST/ });
  if (await summary.isVisible().catch(() => false)) {
    await summary.click();
    return page.getByRole('dialog');
  }
  const review = page.getByRole('button', { name: 'Review order' });
  if (await review.isVisible().catch(() => false)) {
    await review.click();
    return page.getByRole('dialog');
  }
  return page.getByRole('region', { name: 'This order' });
}

/** Marks every ready line served, one at a time, as a captain does. */
export async function serveAll(page) {
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const area = await details(page);
  const serve = area.getByRole('button', { name: 'Mark served' });
  for (let left = await serve.count(); left > 0; left = await serve.count()) {
    await serve.first().click();
    await expect(serve).toHaveCount(left - 1);
  }
}

/** Cancels one line, with its fixed reason, and says whether the kitchen made it. */
export async function cancelLine(page, item, reason, wasPrepared = null) {
  const area = await details(page);
  const line = area.locator('li').filter({ hasText: item }).filter({ hasNot: page.getByText('Cancelled', { exact: true }) });
  await line.getByRole('button', { name: /^Cancel/ }).first().click();
  const sheet = page.getByRole('dialog', { name: `Cancel ${item}` });
  await sheet.getByRole('button', { name: reason, exact: true }).click();
  if (wasPrepared !== null) await sheet.getByText(wasPrepared ? 'Yes, it was made' : 'No, it was not started').click();
  await sheet.getByRole('button', { name: /^Cancel it/ }).click();
  await expect(page.getByText('Line cancelled.')).toBeVisible();
}

/** Cancels an unsent dish from its card: the minus at one opens the cancel panel. */
export async function removeUnsent(page, item, reason) {
  await card(page, item).getByRole('button', { name: `Remove ${item}` }).click();
  const sheet = page.getByRole('dialog', { name: `Cancel ${item}` });
  await sheet.getByRole('button', { name: reason, exact: true }).click();
  await sheet.getByRole('button', { name: /^Cancel it/ }).click();
  await expect(page.getByText('Line cancelled.')).toBeVisible();
}

/** No Charge, from the order's sheet. Manager. */
export async function giveNoCharge(page, reason) {
  const area = await details(page);
  await area.getByRole('button', { name: 'No Charge', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'No Charge' });
  await sheet.getByRole('button', { name: reason, exact: true }).click();
  await sheet.getByRole('button', { name: 'Give No Charge' }).click();
  await expect(page.getByText('No Charge given. The table is free.')).toBeVisible();
}

/** Bills an order waiting for the cashier, and lands on its bill. */
export async function billOrder(page) {
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Bill this order' }).click();
  await expect(page).toHaveURL(/\/bills\/[a-f0-9]{24}$/);
  return page.url();
}
