import { expect } from '@playwright/test';

/** The tickets on a station's screen for one place ("Table 7", "Order 12"). */
export const tickets = (page, place) =>
  page.locator('article').filter({ has: page.getByText(place, { exact: true }) });

export async function openStation(page, station) {
  await page.goto('/kitchen');
  await page.getByRole('tab', { name: station, exact: true }).click();
  await expect(page.getByRole('tab', { name: station, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Loading tickets…')).toHaveCount(0);
  // The board shows either tickets or "All caught up" once this station's list is in.
  await expect(page.locator('article').first().or(page.getByText('All caught up'))).toBeVisible();
}

/**
 * Marks every ticket for a place ready by holding each ticket's footer. P29
 * Part E: the whole ticket needs the button held for half a second.
 */
export async function markReady(page, station, place) {
  await openStation(page, station);
  const list = tickets(page, place);
  for (let left = await list.count(); left > 0; left = await list.count()) {
    await list.first().locator('footer button').click({ delay: 700 });
    await expect(list).toHaveCount(left - 1);
  }
}

/** P29 Part E. Ticks one dish ready on a place's ticket, by tapping its row. */
export async function tickDish(page, place, dish) {
  await tickets(page, place).first().locator('li', { hasText: dish }).getByRole('button').first().click();
}
