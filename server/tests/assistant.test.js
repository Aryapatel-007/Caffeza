/**
 * P39: the WhatsApp assistant, against a fake Meta and a fake model. No real
 * key is needed. docs/prompts/P39-whatsapp-assistant.md section 16.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { Conversation } from '../models/Conversation.js';
import { Customer } from '../models/Customer.js';
import { IntegrationEvent } from '../models/IntegrationEvent.js';
import { Reservation } from '../models/Reservation.js';
import { checkReply } from '../services/chatbot/replyCheck.js';
import { runDueJobs } from '../services/integrations/jobRunner.js';
import { signMetaBody } from '../services/integrations/messaging/whatsappAdapter.js';
import { sendTemplate } from '../services/integrations/messaging/whatsappService.js';
import { resetClockForTests, setClockForTests } from '../utils/time.js';
import { GOOD, startFakeMeta } from './helpers/fakeMeta.js';
import { FAKE_AI_KEY, lastToolResult, say, startFakeModel, useTool } from './helpers/fakeModel.js';
import { seedFloor } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

let meta;
let model;

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const entry of ALL_MODELS) await entry.init();
  meta = await startFakeMeta();
  model = await startFakeModel();
});

after(async () => {
  await meta.stop();
  await model.stop();
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
  Object.assign(meta.state, { templates: [], messages: [], requests: [], refuseNext: null, down: false });
  Object.assign(model.state, { queue: [], requests: [] });
  // Monday 5 October 2026, noon in India.
  setClockForTests(new Date('2026-10-05T12:00:00+05:30'));
});

afterEach(() => resetClockForTests());

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

const GUEST = '9876543210';
const TOMORROW = '2026-10-06';

/** A restaurant with WhatsApp, the assistant on with the fake model, and bookings taken. */
async function assistantFloor({ ai = true, settings = {} } = {}) {
  const floor = await seedFloor();
  const { tokens } = floor;
  const saved = ok(await request('PUT', '/api/v1/integrations/WHATSAPP', { token: tokens.OWNER, body: { environment: 'SANDBOX', credentials: { ...GOOD }, config: { apiBaseUrl: meta.url } } }), 'whatsapp');
  ok(await request('POST', '/api/v1/integrations/WHATSAPP/test', { token: tokens.OWNER }), 'whatsapp test');
  if (ai) {
    ok(await request('PUT', '/api/v1/integrations/ANTHROPIC', { token: tokens.OWNER, body: { environment: 'SANDBOX', credentials: { apiKey: FAKE_AI_KEY }, config: { apiBaseUrl: model.url } } }), 'anthropic');
    ok(await request('POST', '/api/v1/integrations/ANTHROPIC/test', { token: tokens.OWNER }), 'anthropic test');
  }
  ok(
    await request('PATCH', '/api/v1/settings', {
      token: tokens.OWNER,
      body: { reason: 'The assistant', features: { online: true }, online: { reservationsEnabled: true }, assistant: { enabled: true, ...settings } },
    }),
    'settings',
  );
  return { ...floor, webhookKey: saved.webhookUrl.split('/').at(-1) };
}

/** A guest's message, posted as Meta posts it, then the jobs run: read it, answer it, send it. */
async function guestWrites(floor, text, { id = `wamid.in${Math.random().toString(36).slice(2, 8)}`, buttonId = null } = {}) {
  const message = buttonId
    ? { from: `91${GUEST}`, id, timestamp: '1760000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: buttonId, title: text } } }
    : { from: `91${GUEST}`, id, timestamp: '1760000000', type: 'text', text: { body: text } };
  const payload = { object: 'whatsapp_business_account', entry: [{ id: GOOD.wabaId, changes: [{ field: 'messages', value: { messages: [message] } }] }] };
  const raw = JSON.stringify(payload);
  ok(await request('POST', `/api/v1/hooks/WHATSAPP/${floor.webhookKey}`, { body: payload, headers: { 'X-Hub-Signature-256': signMetaBody(Buffer.from(raw), GOOD.appSecret) } }), 'webhook');
  await runDueJobs();
  await runDueJobs();
}

const sentTo = () => meta.state.messages;
const lastSent = () => sentTo().at(-1);
const textOf = (message) => message?.text?.body ?? message?.interactive?.body?.text ?? null;

describe('the assistant answers from the tools', () => {
  it('answers opening hours from get_restaurant_info, and rejects an hour the tool did not give', async () => {
    const floor = await assistantFloor();
    model.script(useTool('get_restaurant_info'), say('We are open 9:00 am to 11:00 pm.'), say('We are open 10:00 am to 11:00 pm today.'));
    await guestWrites(floor, 'What time do you open?');
    assert.equal(textOf(lastSent()), 'We are open 10:00 am to 11:00 pm today.');
    assert.equal(sentTo().length, 1, 'the rejected reply was never sent');
    assert.match(JSON.stringify(model.state.requests.at(-1).messages), /was not sent: The time 09:00 did not come from a tool/);
  });

  it('books a table in turns, only after a yes, as a request the restaurant still confirms', async () => {
    const floor = await assistantFloor();
    model.script(useTool('get_booking_options', { date: TOMORROW, partySize: 2 }), say('8:00 pm is free for 2 tomorrow. What name should I book it under?'));
    await guestWrites(floor, 'table for 2 tomorrow at 8 pm?');
    assert.match(textOf(lastSent()), /8:00 pm is free/);

    model.script(say('So: 2 people, Tuesday 6 October at 8:00 pm, under Asha. Shall I book it?\n[Options: Yes | No]'));
    await guestWrites(floor, 'Asha');
    assert.equal(lastSent().type, 'interactive', 'the question comes with buttons');
    assert.deepEqual(lastSent().interactive.action.buttons.map((button) => button.reply.title), ['Yes', 'No']);
    assert.equal(await Reservation.countDocuments({ restaurantId: floor.restaurant._id }), 0, 'nothing booked before the yes');

    model.script(useTool('request_booking', { date: TOMORROW, time: '20:00', partySize: 2, name: 'Asha' }), (body) => {
      const result = lastToolResult(body);
      return say(`Your booking request *${result.reference}* is in, for 2 at 8:00 pm tomorrow. The restaurant will confirm it shortly.`);
    });
    await guestWrites(floor, 'Yes', { buttonId: 'OPTION_1' });
    const [booking] = await Reservation.find({ restaurantId: floor.restaurant._id }).lean();
    assert.equal(booking.source, 'WHATSAPP');
    assert.equal(booking.status, 'REQUESTED');
    assert.equal(booking.guestPhone, GUEST);
    assert.equal(booking.partySize, 2);
    assert.match(textOf(lastSent()), new RegExp(`\\*${booking.reference}\\*`));

    // Staff confirm it, and the guest is told inside their window.
    ok(await request('POST', `/api/v1/online/reservations/${booking._id}/confirm`, { token: floor.tokens.MANAGER, body: {} }), 'confirm');
    await runDueJobs();
    assert.match(textOf(lastSent()), new RegExp(`Your table is confirmed: \\*${booking.reference}\\*`));

    // The model was never sent the guest's number.
    assert.equal(JSON.stringify(model.state.requests).includes(GUEST), false);
    // No event line holds the number or what the guest wrote.
    const lines = JSON.stringify(await IntegrationEvent.find({ restaurantId: floor.restaurant._id }).lean());
    assert.equal(lines.includes(GUEST), false);
    assert.equal(lines.includes('table for 2 tomorrow'), false);
  });

  it('never books a time that is not offered', async () => {
    const floor = await assistantFloor();
    model.script(useTool('request_booking', { date: TOMORROW, time: '20:10', partySize: 2, name: 'Asha' }), (body) => {
      assert.equal(lastToolResult(body).ok, false);
      return say('That time is not free. 8:00 pm or 8:30 pm?');
    });
    await guestWrites(floor, 'book 8:10 pm tomorrow for 2, Asha');
    assert.equal(await Reservation.countDocuments({ restaurantId: floor.restaurant._id }), 0);
  });

  it("never touches another guest's booking", async () => {
    const floor = await assistantFloor();
    const other = await Reservation.create({
      restaurantId: floor.restaurant._id,
      branchId: floor.branch._id,
      reference: 'R-1',
      source: 'ONLINE',
      guestName: 'Someone Else',
      guestPhone: '9123456789',
      partySize: 4,
      at: new Date('2026-10-06T20:00:00+05:30'),
      businessDate: TOMORROW,
      status: 'REQUESTED',
      answerBy: new Date('2026-10-06T19:00:00+05:30'),
    });
    model.script(useTool('cancel_booking', { reference: 'R-1' }), (body) => {
      assert.equal(lastToolResult(body).ok, false);
      return say('I cannot find that booking for you.');
    });
    await guestWrites(floor, 'cancel R-1');
    assert.equal((await Reservation.findOne({ restaurantId: floor.restaurant._id, _id: other._id }).lean()).status, 'REQUESTED');
  });
});

describe('stop, understood', () => {
  it('stops offers, and the bill still goes; stops all, and nothing goes', async () => {
    const floor = await assistantFloor();
    model.script(useTool('get_restaurant_info'), say('Hello.'));
    await guestWrites(floor, 'hi');
    await Customer.updateOne({ restaurantId: floor.restaurant._id, phone: GUEST }, { $set: { offers: { given: true, textVersion: 'v1', at: new Date(), source: 'STAFF' } } });

    model.script(useTool('stop_messages', { scope: 'OFFERS' }), say('Done, no more offers from us. Bills and booking messages will still come.'));
    await guestWrites(floor, 'offers mat bhejo please');
    let guest = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean();
    assert.equal(guest.offers.given, false);
    assert.equal(guest.offersHistory.at(-1).reason, 'Asked on WhatsApp to stop offers');
    assert.equal(guest.whatsappStoppedAt, null);

    model.script(useTool('stop_messages', { scope: 'ALL' }), say('Understood. We will not message you again.'));
    await guestWrites(floor, 'never message me again');
    guest = await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean();
    assert.ok(guest.whatsappStoppedAt);
    assert.equal(textOf(lastSent()), 'Understood. We will not message you again.', 'the answer to their own message still goes');

    // Nothing more goes, bills included.
    meta.addApproved({ name: 'bill_receipt' });
    ok(
      await request('POST', '/api/v1/integrations/whatsapp/templates', {
        token: floor.tokens.OWNER,
        body: { key: 'BILL_RECEIPT', metaName: 'bill_receipt', category: 'UTILITY', bodyText: 'Bill {{1}}', variables: ['billNumber'], submit: false },
      }),
      'template',
    );
    const ctx = { restaurantId: floor.restaurant._id, branchId: floor.branch._id };
    assert.deepEqual(await sendTemplate({ ...ctx, phone: GUEST, templateKey: 'BILL_RECEIPT', variables: { billNumber: 'X' }, idempotencyKey: 'x' }), { queued: false, skipped: 'STOPPED' });
  });

  it('rejects a reply that says messages are stopped when stop_messages was not called', async () => {
    const floor = await assistantFloor();
    model.script(say('Hello.'));
    await guestWrites(floor, 'hi');
    await Customer.updateOne({ restaurantId: floor.restaurant._id, phone: GUEST }, { $set: { offers: { given: true, textVersion: 'v1', at: new Date(), source: 'STAFF' } } });
    model.script(say("Okay, you won't get any more messages from us."), useTool('stop_messages', { scope: 'ALL' }), say('Done. We will not message you again.'));
    await guestWrites(floor, 'stop bugging me');
    assert.equal(textOf(lastSent()), 'Done. We will not message you again.');
    assert.ok((await Customer.findOne({ restaurantId: floor.restaurant._id, phone: GUEST }).lean()).whatsappStoppedAt, 'a stop is never only words');
  });

  it('keeps the exact STOP keyword working without the model', async () => {
    const floor = await assistantFloor();
    model.script(say('Hello.'));
    await guestWrites(floor, 'hi');
    const before = model.state.requests.length;
    await guestWrites(floor, 'STOP');
    assert.equal(model.state.requests.length, before, 'no model call for the keyword');
    assert.match(textOf(lastSent()), /will not get offers/);
  });
});

describe('people and fallbacks', () => {
  it('stays quiet once handed to staff; staff reply inside the window and are refused after it', async () => {
    const floor = await assistantFloor();
    model.script(useTool('hand_to_staff', { reason: 'Asks about catering' }), say('A person from the restaurant will reply as soon as they can.'));
    await guestWrites(floor, 'do you do catering for 80 people?');
    const before = model.state.requests.length;
    await guestWrites(floor, 'hello?');
    assert.equal(model.state.requests.length, before, 'the model is not asked while a person has it');

    const [chat] = ok(await request('GET', '/api/v1/chats', { token: floor.tokens.CASHIER }), 'chats');
    assert.equal(chat.status, 'NEEDS_STAFF');
    assert.equal(chat.windowOpen, true);
    assert.equal(JSON.stringify(chat).includes(GUEST), false, 'no number in the list');
    ok(await request('POST', `/api/v1/chats/${chat.id}/reply`, { token: floor.tokens.CASHIER, body: { text: 'Yes, we do. I will call you.' } }), 'reply');
    await runDueJobs();
    assert.equal(textOf(lastSent()), 'Yes, we do. I will call you.');

    setClockForTests(new Date('2026-10-06T13:00:00+05:30'));
    assert.equal((await request('POST', `/api/v1/chats/${chat.id}/reply`, { token: floor.tokens.CASHIER, body: { text: 'Hello again' } })).status, 422);
    assert.equal((await request('GET', '/api/v1/chats', { token: floor.tokens.WAITER })).status, 403);
  });

  it('answers with the fixed menu when the day\'s AI limit is used, and its buttons work without the model', async () => {
    const floor = await assistantFloor({ settings: { dailyAiLimit: 0 } });
    await guestWrites(floor, 'hi');
    assert.equal(model.state.requests.length, 0);
    assert.deepEqual(lastSent().interactive.action.buttons.map((button) => button.reply.title), ['Book a table', 'Opening hours', 'Talk to us']);
    await guestWrites(floor, 'Opening hours', { buttonId: 'MENU_HOURS' });
    assert.match(textOf(lastSent()), /We are open 10:00 am to 11:00 pm/);
  });

  it('falls back to the fixed menu when the model cannot be reached', async () => {
    const floor = await assistantFloor();
    model.script('DOWN');
    await guestWrites(floor, 'hi');
    assert.equal(lastSent().type, 'interactive');
  });

  it('says nothing with the assistant off, and keeps the chat for staff', async () => {
    const floor = await assistantFloor({ settings: { enabled: false } });
    await guestWrites(floor, 'hi');
    assert.equal(sentTo().length, 0);
    assert.equal(await Conversation.countDocuments({ restaurantId: floor.restaurant._id }), 1);
  });

  it("never reads another restaurant's chats", async () => {
    const a = await assistantFloor();
    model.script(say('Hello.'));
    await guestWrites(a, 'hi');
    const b = await seedFloor();
    assert.deepEqual(ok(await request('GET', '/api/v1/chats', { token: b.tokens.OWNER }), 'b chats'), []);
    const [chat] = ok(await request('GET', '/api/v1/chats', { token: a.tokens.OWNER }), 'a chats');
    assert.equal((await request('GET', `/api/v1/chats/${chat.id}`, { token: b.tokens.OWNER })).status, 404);
  });
});

describe('the reply check', () => {
  it('lets through only amounts, times, links and references it was given', () => {
    const allowed = '{"dishes":[{"name":"Roti","price":"₹40.00"}],"onlinePage":"https://zchaat-pos.vercel.app/r/zchaat","times":[{"time":"20:00","words":"8:00 pm"}],"reference":"R-17"}';
    assert.equal(checkReply('Roti is ₹40 before GST.', { allowed, messagesAreStopped: false }).ok, true);
    assert.equal(checkReply('Roti is ₹45.', { allowed, messagesAreStopped: false }).ok, false);
    assert.equal(checkReply('Book here: https://zchaat-pos.vercel.app/r/zchaat', { allowed, messagesAreStopped: false }).ok, true);
    assert.equal(checkReply('Pay here: https://evil.example/pay', { allowed, messagesAreStopped: false }).ok, false);
    assert.equal(checkReply('Your request *R-17* is in for 8:00 pm.', { allowed, messagesAreStopped: false }).ok, true);
    assert.equal(checkReply('Your request *R-18* is in.', { allowed, messagesAreStopped: false }).ok, false);
    assert.equal(checkReply('Your table is confirmed for 8 pm.', { allowed, messagesAreStopped: false }).ok, false);
    assert.equal(checkReply('The restaurant will confirm it shortly.', { allowed, messagesAreStopped: false }).ok, true);
    assert.equal(checkReply('x'.repeat(901), { allowed, messagesAreStopped: false }).ok, false);
    const withOptions = checkReply('Shall I book it?\n[Options: Yes | No]', { allowed, messagesAreStopped: false });
    assert.deepEqual([withOptions.text, withOptions.buttons], ['Shall I book it?', ['Yes', 'No']]);
  });
});
