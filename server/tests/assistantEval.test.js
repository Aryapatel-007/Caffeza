/**
 * P51 section 16: the eval's own cases and its scoring. The eval itself calls
 * a real model and runs by hand (`npm run assistant:eval`); this checks that
 * the cases are well formed and that the bar is scored the way it says.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { accepted, judge, LABELS, outcomeNames, outcomeOf, readEvalFile, retryAfterMs, summarise } from '../scripts/assistantEval.js';

describe('the assistant eval', () => {
  test('every case is well formed, and the set covers every label', () => {
    const { cases, offer } = readEvalFile();
    assert.ok(offer.length > 0);
    assert.ok(cases.length >= 80, `only ${cases.length} cases`);
    const names = outcomeNames();
    const ids = new Set();
    for (const testCase of cases) {
      assert.ok(!ids.has(testCase.id), `${testCase.id} is used twice`);
      ids.add(testCase.id);
      assert.ok(LABELS.includes(testCase.label), `${testCase.id}: unknown label ${testCase.label}`);
      assert.ok(testCase.text.trim().length > 0, `${testCase.id}: no text`);
      assert.ok(testCase.accept.length > 0, `${testCase.id}: accepts nothing`);
      for (const outcome of testCase.accept) assert.ok(names.has(outcome), `${testCase.id}: unknown outcome ${outcome}`);
      for (const [role] of testCase.history ?? []) assert.ok(role === 'GUEST' || role === 'ASSISTANT', `${testCase.id}: bad history role`);
      if (testCase.history?.length) assert.equal(testCase.history[0][0], 'GUEST', `${testCase.id}: history must start with the guest`);
    }
    for (const label of LABELS) assert.ok(cases.some((testCase) => testCase.label === label), `no ${label} case`);
    // A case that labels a message a clear stop must accept nothing but a stop,
    // or the "no stop missed" bar would be passed by a question.
    for (const testCase of cases.filter((c) => c.label === 'STOP_OFFERS'))
      assert.ok(testCase.accept.every((outcome) => outcome.startsWith('stop_messages:')), `${testCase.id} accepts something that is not a stop`);
  });

  test('the first thing the model did is read as a tool, a stop with its scope, a question or a reply', () => {
    assert.equal(outcomeOf({ text: '', toolCalls: [{ name: 'stop_messages', arguments: { scope: 'ALL' } }] }), 'stop_messages:ALL');
    assert.equal(outcomeOf({ text: 'x', toolCalls: [{ name: 'search_menu', arguments: {} }, { name: 'hand_to_staff', arguments: {} }] }), 'search_menu');
    assert.equal(outcomeOf({ text: 'For how many people?', toolCalls: [] }), 'ASK');
    assert.equal(outcomeOf({ text: 'Which would you like?\n[Options: Stop offers only | Stop all messages | Neither]', toolCalls: [] }), 'ASK');
    assert.equal(outcomeOf({ text: 'Thank you, we are glad you liked it.', toolCalls: [] }), 'NONE');
    assert.ok(accepted('ASK', ['NONE']), 'a question is a text reply');
    assert.ok(!accepted('NONE', ['ASK']), 'a reply with no question is not one');
  });

  test('a stop missed, a false stop and a wrong scope are told apart, and any of the first two fails the bar', () => {
    const stopCase = { id: 'a', label: 'STOP_OFFERS', accept: ['stop_messages:OFFERS'] };
    const notStop = { id: 'b', label: 'NOT_STOP', accept: ['NONE'] };
    const allCase = { id: 'c', label: 'STOP_ALL', accept: ['stop_messages:ALL'] };
    assert.equal(judge(stopCase, 'NONE').mistake, 'STOP_MISSED');
    assert.equal(judge(notStop, 'stop_messages:OFFERS').mistake, 'FALSE_STOP');
    assert.equal(judge(allCase, 'stop_messages:OFFERS').mistake, 'WRONG_SCOPE');
    assert.equal(judge(notStop, 'search_menu').mistake, 'OTHER');

    const right = Array.from({ length: 40 }, (_, i) => judge({ id: `r${i}`, label: 'MENU', accept: ['search_menu'] }, 'search_menu'));
    assert.equal(summarise(right).passes, true);
    const oneMissed = summarise([...right, judge(stopCase, 'NONE')]);
    assert.equal(oneMissed.overall > 0.95, true);
    assert.equal(oneMissed.passes, false, 'one missed stop fails even above 95%');
    assert.equal(summarise([...right, judge(notStop, 'stop_messages:ALL')]).passes, false, 'one false stop fails too');
    assert.equal(summarise([...right, judge(allCase, 'stop_messages:OFFERS')]).passes, true, 'a wrong scope alone counts against 95% only');
  });

  test('a rate limit message says how long to wait', () => {
    assert.equal(retryAfterMs('Rate limit reached ... Please try again in 2.5s. Need more tokens?'), 3000);
    assert.equal(retryAfterMs('Rate limit reached ... Please try again in 1m30s.'), 90_500);
    assert.equal(retryAfterMs('Rate limit reached on tokens per day. Please try again in 1h2m3s.'), 3_723_500);
    assert.equal(retryAfterMs('The AI answered 429.'), 20_000);
    assert.equal(retryAfterMs('Invalid API key'), null);
  });
});
