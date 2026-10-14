/**
 * P51, through the screens, against a fake Meta and a fake model: a guest asks
 * for a table on WhatsApp, says yes to the details, and gets a reference; the
 * request waits on the Bookings screen, the cashier confirms it there, and the
 * guest is told on WhatsApp. The cashier's Chats screen shows the chat.
 *
 * The model's answers are scripted (`/model/script` on the e2e server's
 * control port), so this checks the plumbing, not the model's judgement:
 * that is `npm run assistant:eval`.
 */
import { createHmac } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { at, resetGolden } from './helpers/clock.js';
import { signIn } from './helpers/people.js';

const DAY = '2026-09-26';
const APP = 'http://127.0.0.1:5055/api/v1';
const CONTROL = 'http://127.0.0.1:5056';
const GUEST = '9876543210';

// Made up for the fakes, never a real value: tests/helpers/fakeMeta.js and fakeModel.js.
const FAKE = {
  phoneNumberId: '100000000000001',
  wabaId: '200000000000002',
  accessToken: 'fake-meta-access-token-not-real-0001',
  webhookVerifyToken: 'fake-verify-token-not-real-0001',
  appSecret: 'fake-meta-app-secret-not-real-0001',
};
const FAKE_AI_KEY = 'fake-anthropic-key-not-real-0001';

async function api(method, path, token, body) {
  const response = await fetch(`${APP}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(parsed)}`);
  return parsed.data;
}
const control = async (path, body) => (await fetch(`${CONTROL}${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })).json();
const sentToGuest = async () => (await control('/meta')).messages.filter((message) => message.to === `91${GUEST}`);
const textOf = (message) => message?.text?.body ?? message?.interactive?.body?.text ?? '';

const useTool = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${name}`, name, input }], stop_reason: 'tool_use' });
const say = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

/** The guest's message, posted and signed as Meta posts it. */
async function guestWrites(webhookKey, text) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ id: FAKE.wabaId, changes: [{ field: 'messages', value: { messages: [{ from: `91${GUEST}`, id: `wamid.e2e${Math.random().toString(36).slice(2, 8)}`, timestamp: '1760000000', type: 'text', text: { body: text } }] } }] }],
  };
  const raw = JSON.stringify(payload);
  const signature = `sha256=${createHmac('sha256', FAKE.appSecret).update(raw).digest('hex')}`;
  const response = await fetch(`${APP}/hooks/WHATSAPP/${webhookKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature }, body: raw });
  expect(response.ok).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test('a guest books a table on WhatsApp, and is told when it is confirmed', async ({ browser }) => {
  const golden = await resetGolden();
  await at('15:00', DAY);
  const owner = (await api('POST', '/auth/login', null, { phone: golden.phones.Owner, password: golden.password })).accessToken;
  const [{ url: metaUrl }, { url: modelUrl }] = await Promise.all([control('/meta'), control('/model')]);

  // The owner connects WhatsApp and an AI key, and switches the assistant on.
  const whatsapp = await api('PUT', '/integrations/WHATSAPP', owner, { environment: 'SANDBOX', credentials: FAKE, config: { apiBaseUrl: metaUrl } });
  await api('POST', '/integrations/WHATSAPP/test', owner, {});
  await api('PUT', '/integrations/ANTHROPIC', owner, { environment: 'SANDBOX', credentials: { apiKey: FAKE_AI_KEY }, config: { apiBaseUrl: modelUrl } });
  await api('POST', '/integrations/ANTHROPIC/test', owner, {});
  await api('PATCH', '/settings', owner, {
    reason: 'The WhatsApp assistant',
    features: { online: true },
    online: { reservationsEnabled: true },
    assistant: { enabled: true },
  });
  const webhookKey = whatsapp.webhookUrl.split('/').at(-1);

  // "A table for 2 tonight at 8": the model looks the time up, then asks for a name.
  await control('/model/script', { steps: [useTool('get_booking_options', { date: DAY, partySize: 2 }), say('8:00 pm is free for 2 tonight. What name should I book it under?')] });
  await guestWrites(webhookKey, 'table for 2 tonight at 8 pm?');
  await expect.poll(async () => textOf((await sentToGuest()).at(-1)), { timeout: 20_000 }).toMatch(/8:00 pm is free/);

  // The name, then the details read back with Yes and No.
  await control('/model/script', { steps: [say('So: 2 people, today at 8:00 pm, under Asha. Shall I book it?\n[Options: Yes | No]')] });
  await guestWrites(webhookKey, 'Asha');
  await expect.poll(async () => (await sentToGuest()).at(-1)?.type, { timeout: 20_000 }).toBe('interactive');

  // Yes: the request is made, and the guest gets its reference.
  await control('/model/script', {
    steps: [
      useTool('request_booking', { date: DAY, time: '20:00', partySize: 2, name: 'Asha' }),
      { sayFromResult: 'Your booking request *{reference}* is in, for 2 at 8:00 pm today. The restaurant will confirm it shortly.' },
    ],
  });
  await guestWrites(webhookKey, 'Yes');
  await expect.poll(async () => textOf((await sentToGuest()).at(-1)), { timeout: 20_000 }).toMatch(/Your booking request \*R-1\* is in/);

  // The cashier sees it waiting, confirms it on the Bookings screen, and reads the chat.
  const cashier = await signIn(browser, { name: 'Counter', phone: golden.phones.Counter, password: golden.password, device: 'tablet' });
  await cashier.page.goto('/online/bookings');
  await expect(cashier.page.getByText('R-1 · on WhatsApp')).toBeVisible();
  await cashier.page.getByRole('button', { name: 'Confirm' }).click();
  const confirmSheet = cashier.page.getByRole('dialog');
  await confirmSheet.getByLabel('Table').selectOption({ label: 'Table 5' });
  await confirmSheet.getByRole('button', { name: 'Confirm' }).click();
  await expect(cashier.page.getByText('R-1 confirmed.')).toBeVisible();

  // Inside the window the guest wrote in, so a plain message, not a template.
  await expect.poll(async () => textOf((await sentToGuest()).at(-1)), { timeout: 20_000 }).toMatch(/Your table is confirmed: \*R-1\*/);
  expect((await sentToGuest()).at(-1).type).toBe('text');

  await cashier.page.getByRole('link', { name: /^Chats/ }).click();
  await expect(cashier.page.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await cashier.page.getByRole('main').getByRole('listitem').first().getByRole('button').click();
  await expect(cashier.page.getByText('table for 2 tonight at 8 pm?')).toBeVisible();
  await expect(cashier.page.getByText(GUEST)).toHaveCount(0);

  // On a phone the open chat takes the screen, with no sideways scroll.
  await cashier.page.setViewportSize({ width: 380, height: 800 });
  await expect(cashier.page.getByRole('button', { name: 'Back to chats' })).toBeVisible();
  expect(await cashier.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380);
});
