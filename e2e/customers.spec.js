/**
 * P27, through the screens: a captain on a phone seats Table 2 with the
 * guest's name and mobile, and the guest's yes to offers; the owner finds the
 * guest on the Customers screen, with the visit.
 */
import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';
import { gotoFloor, tile } from './pages/floor.js';

const DAY = '2026-09-26';

test.describe.configure({ mode: 'serial' });

test('a guest seated with their details shows on the Customers screen', async ({ browser }) => {
  const golden = await resetGolden();
  await at('19:00', DAY);

  const captain = await signIn(browser, { name: 'Khuman Singh', phone: golden.phones['Khuman Singh'], password: golden.password, device: 'phone' });
  await gotoFloor(captain.page);
  await tile(captain.page, 'Table 2', 'free').click();
  const sheet = captain.page.getByRole('dialog');
  await sheet.getByRole('button', { name: '3', exact: true }).click();
  await sheet.getByLabel('Guest name').fill('Meera Joshi');
  await sheet.getByLabel('Mobile number').fill('98250 12345');
  await sheet.getByText('The guest agrees to offers and news by SMS or WhatsApp').click();
  await captain.page.screenshot({ path: 'e2e/screenshots/seat-guest-details.png', fullPage: true });
  await sheet.getByRole('button', { name: /^Start order/ }).click();
  await expect(captain.page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);
  await expect(captain.page.getByText('Meera Joshi').first()).toBeVisible();

  const owner = await signIn(browser, { name: 'Owner', phone: golden.phones.Owner, password: golden.password, device: 'computer' });
  await owner.page.goto('/customers');
  await owner.page.getByLabel('Search').fill('meera');
  const card = owner.page.getByRole('button', { name: /Meera Joshi/ });
  await expect(card).toContainText('9825012345');
  await expect(card).toContainText('1 visit');
  await expect(card).toContainText('Agreed to offers');
  await card.click();
  await expect(owner.page.getByRole('dialog', { name: 'Meera Joshi' }).getByText(/Table 2/)).toBeVisible();
  await owner.page.screenshot({ path: 'e2e/screenshots/customers.png', fullPage: true });
});
