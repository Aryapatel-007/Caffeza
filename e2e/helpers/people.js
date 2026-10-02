import { expect } from '@playwright/test';

import { track } from './clock.js';

/** The three kinds of device in the cafe. */
export const DEVICES = {
  phone: { viewport: { width: 380, height: 800 }, isMobile: true, hasTouch: true },
  computer: { viewport: { width: 1280, height: 800 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
};

/**
 * One person on one device: their own browser context, signed in through the
 * sign-in screen, with every print recorded instead of sent to paper.
 */
export async function signIn(browser, { name, phone, password, device }) {
  const context = await browser.newContext(DEVICES[device]);
  const prints = [];
  await context.exposeBinding('__recordPrint', (_source, text, paperMm, options) => prints.push({ text, paperMm, logo: Boolean(options?.logo) }));
  // The client's print code calls this when it is set. Only a test ever sets it.
  await context.addInitScript(() => {
    window.__E2E_PRINT__ = (text, paperMm, options) => window.__recordPrint(text, paperMm, options);
  });

  const page = await context.newPage();
  await track(page);
  await page.goto('/login');
  await page.getByLabel('Phone or email').fill(phone);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return { name, device, context, page, prints };
}

/** Sets this device's theme (Automatic, Day or Night) and reloads. */
export async function setTheme(person, theme) {
  await person.page.evaluate((value) => {
    const stored = JSON.parse(window.localStorage.getItem('caffeza.device') ?? '{}');
    window.localStorage.setItem('caffeza.device', JSON.stringify({ ...stored, theme: value }));
  }, theme);
  await person.page.reload();
}
