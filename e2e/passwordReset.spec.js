/**
 * P34, through the screens: the cashier has forgotten their password. On a
 * phone, they tap Forgot password?, the manager beside them types their own
 * phone and PIN, and the cashier lands signed in with the new password. A
 * wrong PIN first is refused and changes nothing.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden, track } from './helpers/clock.js';
import { DEVICES } from './helpers/people.js';

const MANAGER_PIN = '2468';
const NEW_PASSWORD = 'counter new 2026';

test('a forgotten password, set again with the manager beside them', async ({ browser }) => {
  const golden = await resetGolden();
  await at('10:00');

  const context = await browser.newContext(DEVICES.phone);
  const page = await context.newPage();
  await track(page);
  await page.goto('/login');

  await page.getByLabel('Phone or email').fill(golden.phones.Counter);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  // The phone typed on the sign-in form carries over.
  await expect(page.getByLabel('Phone or email')).toHaveValue(golden.phones.Counter);

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('New password again').fill(NEW_PASSWORD);
  await page.getByLabel("Manager's phone").fill(golden.phones.Manager);

  await page.getByLabel('PIN').fill('1111');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('alert')).toContainText('The password was not changed');
  await expect(page.getByLabel('PIN')).toHaveValue('');

  await page.getByLabel('PIN').fill(MANAGER_PIN);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(scrolls).toBe(false);
  await context.close();

  // The old password no longer works; the new one does.
  const tryLogin = (password) =>
    fetch('http://127.0.0.1:5055/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: golden.phones.Counter, password }),
    }).then((response) => response.status);
  expect(await tryLogin(golden.password)).toBe(401);
  expect(await tryLogin(NEW_PASSWORD)).toBe(200);
});
