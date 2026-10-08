/**
 * P25 Part L, the integration screens. The owner connects Tally through the
 * Integrations page, sees the days on the Tally page and pairs a bridge; a
 * manager sees the same pages read-only, on a phone too.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';

const DAY = '2026-09-26';

test.describe.configure({ mode: 'serial' });

test('integrations and Tally, through the screens', async ({ browser }) => {
  const golden = await resetGolden();
  await at('13:00', DAY);

  const owner = await signIn(browser, { name: 'Owner', phone: golden.phones.Owner, password: golden.password, device: 'computer' });
  const page = owner.page;
  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  for (const name of ['Pine Labs', 'Tally', 'Swiggy', 'Zomato']) await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await expect(page.getByRole('button', { name: /Swiggy/ }).getByText('Waiting for partner approval')).toBeVisible();

  // Tally: the company name, saved and tested.
  await page.getByRole('button', { name: /Tally/ }).click();
  await page.getByLabel('Company name, exactly as in Tally').fill('Golden Cafe & Co');
  await page.getByLabel('Vouchers reach Tally').selectOption('BRIDGE');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Tally saved. Test the connection next.')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status').or(page.getByRole('alert')).getByText('Pair a Tally bridge first, on the computer that runs Tally.')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('link', { name: 'Ledger mapping, exports and bridges' }).click();

  await expect(page.getByRole('heading', { name: 'Tally', exact: true })).toBeVisible();
  await expect(page.getByText('Pair a bridge below, then test the connection in Integrations.')).toBeVisible();
  await expect(page.getByLabel('CGST output')).toBeVisible();
  await page.getByLabel('Name of that computer').fill('Accounts PC');
  await page.getByRole('button', { name: 'Make a pairing code' }).click();
  const command = page.getByText(/node bridge\.js pair [A-Z2-9]{8} --server/);
  await expect(command).toBeVisible();
  await expect(page.getByText('Waiting for its code')).toBeVisible();

  // The accountant's computer uses the code, as bridge.js pair does.
  const code = /pair ([A-Z2-9]{8})/.exec(await command.textContent())[1];
  const paired = await fetch('http://127.0.0.1:5055/api/v1/tally-bridge/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, machineName: 'ACCOUNTS-PC' }),
  });
  expect(paired.status).toBe(201);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Paired', { exact: true })).toBeVisible();

  // Now the connection tests, and the days appear.
  await page.goto('/settings/integrations/TALLY');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Tally answered. It is connected.')).toBeVisible();
  await page.goto('/settings/tally');
  await expect(page.getByText('Open day').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/integrations-tally-owner.png', fullPage: true });

  // A manager on a phone: the same pages, nothing to change.
  const manager = await signIn(browser, { name: 'Manager', phone: golden.phones.Manager, password: golden.password, device: 'phone' });
  await manager.page.goto('/settings/integrations/TALLY');
  await expect(manager.page.getByLabel('Company name, exactly as in Tally')).toBeDisabled();
  await expect(manager.page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await manager.page.goto('/settings/tally');
  await expect(manager.page.getByRole('button', { name: 'Make a pairing code' })).toHaveCount(0);
  const wide = await manager.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(wide).toBe(false);
  await manager.page.screenshot({ path: 'e2e/screenshots/integrations-tally-manager-phone.png', fullPage: true });
});
