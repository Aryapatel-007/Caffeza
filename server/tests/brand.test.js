/**
 * P22: the warm neutral set, the brand pair and the restaurant's logo.
 * docs/DESIGN-SYSTEM.md sections 4a, 4d and 15, docs/API-CONTRACT.md M7 section
 * 1 and M20 section P22.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ALL_MODELS } from '../models/index.js';
import * as colour from '../utils/colour.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = readFileSync(path.resolve(here, '../../client/src/index.css'), 'utf8').replace(/\r\n/g, '\n');

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

const { contrastRatio, NEUTRALS, STATES } = colour;
const WARM = NEUTRALS.WARM;
const COOL = NEUTRALS.COOL;
const CAFEZZA_ACCENT = '#49302D';
const LOGO_BROWN = '#4A2E2A';

describe('the warm neutral set', () => {
  for (const theme of ['day', 'night']) {
    const set = WARM[theme];

    it(`keeps every text pair at 4.5 to 1 or more, ${theme}`, () => {
      const pairs = [
        ['ink', 'surface'],
        ['ink', 'ground'],
        ['muted', 'surface'],
        ['muted', 'sunken'],
        ['muted', 'ground'],
      ];
      for (const [text, behind] of pairs) {
        const ratio = contrastRatio(set[text], set[behind]);
        assert.ok(ratio >= 4.5, `${theme} ${text} on ${behind} is ${ratio.toFixed(2)}`);
      }
    });

    it(`keeps every state edge at 3 to 1 on warm surface, and no tint weaker than on cool, ${theme}`, () => {
      for (const [state, values] of Object.entries(STATES)) {
        const { edge, tint } = values[theme];
        assert.ok(contrastRatio(edge, set.surface) >= 3, `${theme} ${state} edge`);
        const warmTint = contrastRatio(tint, set.surface);
        const coolTint = contrastRatio(tint, COOL[theme].surface);
        assert.ok(warmTint >= coolTint - 1e-9, `${theme} ${state} tint ${warmTint} against cool ${coolTint}`);
      }
    });
  }

  it('keeps day surface pure white, so the state tints read exactly as on cool', () => {
    assert.equal(WARM.day.surface, '#FFFFFF');
  });

  it('keeps every preset and Cafezza accent readable on both tones', () => {
    for (const [name, day] of Object.entries({ ...colour.ACCENT_PRESETS, CAFEZZA: CAFEZZA_ACCENT })) {
      const night = colour.nightVariant(day);
      for (const tone of ['COOL', 'WARM']) {
        assert.ok(contrastRatio(day, NEUTRALS[tone].day.ground) >= 3, `${name} on ${tone} day ground`);
        assert.ok(contrastRatio(night, NEUTRALS[tone].night.ground) >= 4.5, `${name} night on ${tone} night ground`);
        // Night button text is night ground.
        assert.ok(contrastRatio(NEUTRALS[tone].night.ground, night) >= 4.5, `${name} night button text, ${tone}`);
      }
    }
  });

  it('matches index.css exactly, in day and night, cool and warm', () => {
    const block = (selector) => {
      const start = INDEX_CSS.indexOf(selector);
      assert.ok(start >= 0, `index.css has ${selector}`);
      return INDEX_CSS.slice(start, INDEX_CSS.indexOf('}', start));
    };
    const css = {
      COOL: { day: block(":root,\n[data-theme='day'] {"), night: block("[data-theme='night'] {") },
      WARM: { day: block("[data-theme='day'][data-neutral='warm'] {"), night: block("[data-theme='night'][data-neutral='warm'] {") },
    };
    const variable = { ground: '--ground', surface: '--surface', sunken: '--sunken', ink: '--ink-v2', muted: '--muted', line: '--line' };
    for (const tone of ['COOL', 'WARM']) {
      for (const theme of ['day', 'night']) {
        for (const [token, name] of Object.entries(variable)) {
          const match = css[tone][theme].match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`));
          assert.ok(match, `${tone} ${theme} declares ${name}`);
          assert.equal(match[1].toUpperCase(), NEUTRALS[tone][theme][token], `${tone} ${theme} ${name}`);
        }
      }
    }
  });
});

describe('the accent on both tones', () => {
  it('accepts #49302D on both grounds, and serves its night value', async () => {
    assert.deepEqual(colour.checkAccent(CAFEZZA_ACCENT), { ok: true });
    assert.equal(colour.nightVariant(CAFEZZA_ACCENT), '#A6746E');

    const { tokens } = await seedTeam();
    const saved = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM', accentHex: CAFEZZA_ACCENT });
    assert.equal(saved.status, 200);
    const me = (await request('GET', '/api/v1/auth/me', { token: tokens.OWNER })).body.data;
    assert.equal(me.appearance.accent, CAFEZZA_ACCENT);
    assert.equal(me.appearance.accentNight, '#A6746E');
  });

  it('refuses the exact logo brown as an accent, naming the Late state', async () => {
    const verdict = colour.checkAccent(LOGO_BROWN);
    assert.equal(verdict.rule, 'STATE_HUE');
    assert.match(verdict.message, /too close to the Late state/);

    const { tokens } = await seedTeam();
    const refused = await patchAppearance(tokens.OWNER, { accentPreset: 'CUSTOM', accentHex: LOGO_BROWN });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error.fields['appearance.accentHex'], /Late state/);
  });

  it('checks a custom accent against every ground of both tones', () => {
    assert.deepEqual([...colour.DAY_GROUNDS], [COOL.day.ground, WARM.day.ground]);
    assert.deepEqual([...colour.NIGHT_GROUNDS], [COOL.night.ground, WARM.night.ground]);

    // Over a grid of colours: every accepted colour reads on both day grounds,
    // and every night value reads on both night grounds. A colour that passed
    // on cool and failed on warm would be refused by the same check; P22
    // measured that white text at 4.5 to 1 already rules every such colour out.
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 17) {
        for (let b = 0; b < 256; b += 17) {
          const hex = colour.toHex({ r, g, b });
          if (colour.checkAccent(hex).ok) {
            for (const ground of colour.DAY_GROUNDS) assert.ok(contrastRatio(hex, ground) >= 3, hex);
          }
          const night = colour.nightVariant(hex);
          assert.ok(colour.lowestContrast(night, colour.NIGHT_GROUNDS) >= 4.5, `${hex} night ${night}`);
        }
      }
    }
  });

  it('leaves every preset night value where P20A put it', () => {
    const expected = { OCEAN: '#2985C2', INDIGO: '#6B7BD1', PLUM: '#A666B8', OLIVE: '#6E8A38', ESPRESSO: '#927A6D', GRAPHITE: '#71818E' };
    for (const [name, day] of Object.entries(colour.ACCENT_PRESETS)) assert.equal(colour.nightVariant(day), expected[name], name);
  });
});

describe('neutralTone', () => {
  it('accepts COOL and WARM, refuses anything else, and reaches every role on /auth/me', async () => {
    const { tokens } = await seedTeam();
    const before = (await request('GET', '/api/v1/auth/me', { token: tokens.WAITER })).body.data;
    assert.equal(before.appearance.neutralTone, 'COOL');

    for (const bad of ['warm', 'BEIGE', '', null, 1]) {
      const refused = await patchAppearance(tokens.OWNER, { neutralTone: bad });
      assert.equal(refused.status, 400, String(bad));
    }

    const saved = await patchAppearance(tokens.OWNER, { neutralTone: 'WARM' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.appearance.neutralTone, 'WARM');
    const me = (await request('GET', '/api/v1/auth/me', { token: tokens.WAITER })).body.data;
    assert.equal(me.appearance.neutralTone, 'WARM');

    assert.equal((await patchAppearance(tokens.MANAGER, { neutralTone: 'COOL' })).status, 403);
  });
});
