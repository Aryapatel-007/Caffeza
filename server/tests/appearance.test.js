/**
 * P20A: the restaurant's look, and station target times.
 * docs/DESIGN-SYSTEM.md sections 4c and 11a, docs/API-CONTRACT.md M7 and M18.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import * as clientColour from '../../client/src/utils/colour.js';
import { ALL_MODELS } from '../models/index.js';
import { TODAY_TILE_KEYS } from '../models/Restaurant.js';
import { TILE_KEYS } from '../services/reports/definitions/today.js';
import * as colour from '../utils/colour.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

const patchAppearance = (token, appearance) =>
  request('PATCH', '/api/v1/settings', { token, body: { reason: 'New look', appearance } });

/** The night column of DESIGN-SYSTEM section 4c, as nightVariant produces it. */
const NIGHT = {
  OCEAN: '#2985C2',
  INDIGO: '#6B7BD1',
  PLUM: '#A666B8',
  OLIVE: '#6E8A38',
  ESPRESSO: '#927A6D',
  GRAPHITE: '#71818E',
};

describe('the accent rules', () => {
  it('accepts each of the six presets, and reads each back on /auth/me', async () => {
    const { tokens } = await seedTeam();
    for (const preset of Object.keys(colour.ACCENT_PRESETS)) {
      const saved = await patchAppearance(tokens.OWNER, { accentPreset: preset });
      assert.equal(saved.status, 200, preset);
      assert.equal(saved.body.data.appearance.accentPreset, preset);

      const me = (await request('GET', '/api/v1/auth/me', { token: tokens.OWNER })).body.data;
      assert.equal(me.appearance.accent, colour.ACCENT_PRESETS[preset]);
      assert.equal(me.appearance.accentNight, NIGHT[preset]);
    }
  });

  it('accepts CUSTOM #2D5DA8 and serves its night variant', async () => {
    const { tokens } = await seedTeam();
    const saved = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM', accentHex: '#2d5da8' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.appearance.accentHex, '#2D5DA8');

    const me = (await request('GET', '/api/v1/auth/me', { token: tokens.OWNER })).body.data;
    assert.equal(me.appearance.accent, '#2D5DA8');
    assert.equal(me.appearance.accentNight, colour.nightVariant('#2D5DA8'));
    assert.ok(colour.contrastRatio(me.appearance.accentNight, colour.NIGHT_GROUND) >= 4.5);
  });

  const refused = [
    ['#FFD54F', 'TEXT_CONTRAST', /White text on this colour is too faint/],
    ['#8A5A00', 'STATE_HUE', /too close to the Open state/],
    ['#9B2F68', 'STATE_HUE', /too close to the Bill printed state/],
    ['#1F6B57', 'STATE_HUE', /too close to the Served state/],
    ['#123', 'FORMAT', /six-digit colour/],
  ];

  for (const [hex, rule, message] of refused) {
    it(`refuses ${hex}, naming the rule it broke and the nearest preset`, async () => {
      assert.equal(colour.checkAccent(hex).rule, rule);

      const { tokens } = await seedTeam();
      const response = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM', accentHex: hex });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_FAILED');
      const field = response.body.error.fields['appearance.accentHex'];
      assert.match(field, message);
      if (rule !== 'FORMAT') assert.match(field, /Try (Ocean|Indigo|Plum|Olive|Espresso|Graphite) instead\./);
    });
  }

  it('accepts #6B5A63, near the bill hue but under 25% saturation', async () => {
    const { h, s } = colour.toHsl('#6B5A63');
    assert.ok(colour.hueDistance(h, colour.toHsl(colour.STATE_COLOURS.bill).h) < 30);
    assert.ok(s < 0.25);

    const { tokens } = await seedTeam();
    const response = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM', accentHex: '#6B5A63' });
    assert.equal(response.status, 200);
  });

  it('refuses CUSTOM with no colour sent or stored', async () => {
    const { tokens } = await seedTeam();
    const response = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM' });
    assert.equal(response.status, 400);
    assert.ok(response.body.error.fields['appearance.accentHex']);
  });

  it('lets only the owner change the look', async () => {
    const { tokens } = await seedTeam();
    const response = await patchAppearance(tokens.MANAGER, { accentPreset: 'PLUM' });
    assert.equal(response.status, 403);
  });

  it('refuses a Today tile that does not exist, and one listed twice', async () => {
    const { tokens } = await seedTeam();
    const unknown = await patchAppearance(tokens.OWNER, { todayTiles: ['grossSales'] });
    assert.equal(unknown.status, 400);
    // The refusal lists every allowed key, so the owner can see what to use.
    const message = Object.values(unknown.body.error.fields ?? {}).join(' ');
    for (const key of TODAY_TILE_KEYS) assert.match(message, new RegExp(key));
    assert.equal((await patchAppearance(tokens.OWNER, { todayTiles: ['covers', 'covers'] })).status, 400);
    const saved = await patchAppearance(tokens.OWNER, { todayTiles: ['covers', 'billTotalInPaise'] });
    assert.deepEqual(saved.body.data.appearance.todayTiles, ['covers', 'billTotalInPaise']);
  });

  it('keeps the Today tile list equal to R1', () => {
    assert.deepEqual([...TODAY_TILE_KEYS], [...TILE_KEYS]);
  });
});

describe('nightVariant', () => {
  it('lifts every preset to at least 4.5 to 1 on night ground, matching the design system table', () => {
    for (const [preset, day] of Object.entries(colour.ACCENT_PRESETS)) {
      const night = colour.nightVariant(day);
      assert.ok(colour.contrastRatio(night, colour.NIGHT_GROUND) >= 4.5, preset);
      assert.equal(night, NIGHT[preset], preset);
      // White text on the day value, and night ground on the night value.
      assert.ok(colour.contrastRatio('#FFFFFF', day) >= 4.5, preset);
      assert.ok(colour.contrastRatio(colour.NIGHT_GROUND, night) >= 4.5, preset);
    }
  });

  it('agrees with the client mirror on 50 seeded random colours', () => {
    let seed = 20261002;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let i = 0; i < 50; i += 1) {
      const hex = `#${(next() % 0x1000000).toString(16).padStart(6, '0').toUpperCase()}`;
      assert.equal(clientColour.nightVariant(hex), colour.nightVariant(hex), hex);
      assert.deepEqual(clientColour.checkAccent(hex), colour.checkAccent(hex), hex);
      assert.equal(clientColour.contrastRatio(hex, '#FFFFFF'), colour.contrastRatio(hex, '#FFFFFF'), hex);
      assert.deepEqual(clientColour.toHsl(hex), colour.toHsl(hex), hex);
    }
  });
});

describe('appearance on /auth/me', () => {
  it('reaches a WAITER, with the night accent worked out and the wordmark resolved', async () => {
    const { tokens, restaurant } = await seedTeam();
    const response = await request('GET', '/api/v1/auth/me', { token: tokens.WAITER });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.appearance, {
      accentPreset: 'OCEAN',
      accent: '#1C5C86',
      accentNight: NIGHT.OCEAN,
      wordmark: restaurant.name,
      secondLanguage: 'NONE',
      todayTiles: [...TODAY_TILE_KEYS],
      // P22. The tone, the brand pair and the logo slots, at their defaults.
      neutralTone: 'COOL',
      brandHex: null,
      onBrandHex: null,
      logos: { LIGHT_GROUND: null, DARK_GROUND: null },
    });
  });
});

describe('station target time', () => {
  it('defaults to 15 minutes, and takes 5 to 120 on create and update', async () => {
    const { tokens } = await seedTeam();
    const created = await request('POST', '/api/v1/stations', { token: tokens.OWNER, body: { name: 'Live Kitchen' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.targetMinutes, 15);

    const id = created.body.data.id;
    const patch = (targetMinutes) =>
      request('PATCH', `/api/v1/stations/${id}`, { token: tokens.MANAGER, body: { targetMinutes } });

    assert.equal((await patch(4)).status, 400);
    assert.equal((await patch(121)).status, 400);
    assert.equal((await patch(12.5)).status, 400);
    const updated = await patch(8);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.targetMinutes, 8);

    const beverages = await request('POST', '/api/v1/stations', {
      token: tokens.OWNER,
      body: { name: 'Beverages', targetMinutes: 120 },
    });
    assert.equal(beverages.body.data.targetMinutes, 120);
    assert.equal(
      (await request('POST', '/api/v1/stations', { token: tokens.OWNER, body: { name: 'Bar', targetMinutes: 0 } })).status,
      400,
    );
  });
});
