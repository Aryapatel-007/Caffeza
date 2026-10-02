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

import { crc32, deflateSync } from 'node:zlib';

import { AuditLog } from '../models/AuditLog.js';
import { ALL_MODELS } from '../models/index.js';
import { Restaurant } from '../models/Restaurant.js';
import * as colour from '../utils/colour.js';
import { businessDateFor } from '../utils/time.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = readFileSync(path.resolve(here, '../../client/src/index.css'), 'utf8').replace(/\r\n/g, '\n');

let baseUrl;

before(async () => {
  await startTestDatabase();
  baseUrl = await startTestServer();
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

describe('the brand pair', () => {
  it('measures Cafezza cream on Cafezza brown at 4.5 to 1 or more', () => {
    const verdict = colour.checkBrandPair(LOGO_BROWN, '#F2D7BC');
    assert.equal(verdict.ok, true);
    assert.ok(verdict.ratio >= 8.8 && verdict.ratio <= 9, String(verdict.ratio));
  });

  it('saves the pair, upper-cased, and reaches every role on /auth/me', async () => {
    const { tokens } = await seedTeam();
    const saved = await patchAppearance(tokens.OWNER, { brandHex: '#4a2e2a', onBrandHex: '#f2d7bc' });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.appearance.brandHex, LOGO_BROWN);
    assert.equal(saved.body.data.appearance.onBrandHex, '#F2D7BC');

    const me = (await request('GET', '/api/v1/auth/me', { token: tokens.KITCHEN })).body.data;
    assert.equal(me.appearance.brandHex, LOGO_BROWN);
    assert.equal(me.appearance.onBrandHex, '#F2D7BC');
  });

  it('refuses a pair under 4.5 to 1, giving the measured ratio', async () => {
    const { tokens } = await seedTeam();
    const refused = await patchAppearance(tokens.OWNER, { brandHex: LOGO_BROWN, onBrandHex: '#7A5A50' });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error.fields['appearance.onBrandHex'], /measures \d\.\d to 1/);
  });

  it('checks one half against the stored other half', async () => {
    const { tokens } = await seedTeam();
    assert.equal((await patchAppearance(tokens.OWNER, { brandHex: LOGO_BROWN, onBrandHex: '#F2D7BC' })).status, 200);
    // A brand colour too close to the stored cream.
    const refused = await patchAppearance(tokens.OWNER, { brandHex: '#C8B09A' });
    assert.equal(refused.status, 400);
    assert.ok(refused.body.error.fields['appearance.onBrandHex']);
    assert.equal((await patchAppearance(tokens.OWNER, { brandHex: '#2E201B' })).status, 200);
  });

  it('refuses one half alone, and clears both together', async () => {
    const { tokens } = await seedTeam();
    const alone = await patchAppearance(tokens.OWNER, { brandHex: LOGO_BROWN });
    assert.equal(alone.status, 400);
    assert.ok(alone.body.error.fields['appearance.onBrandHex']);

    assert.equal((await patchAppearance(tokens.OWNER, { brandHex: LOGO_BROWN, onBrandHex: '#F2D7BC' })).status, 200);
    assert.equal((await patchAppearance(tokens.OWNER, { onBrandHex: null })).status, 400);
    const cleared = await patchAppearance(tokens.OWNER, { brandHex: null, onBrandHex: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.appearance.brandHex, null);
  });

  it('refuses a colour that is not six-digit hex', async () => {
    const { tokens } = await seedTeam();
    for (const bad of ['#4A2E2', 'brown', '#GGGGGG']) {
      const refused = await patchAppearance(tokens.OWNER, { brandHex: bad, onBrandHex: '#F2D7BC' });
      assert.equal(refused.status, 400, bad);
    }
  });
});

// ---------------------------------------------------------------------------
// The logo. Every fixture below is built byte by byte with a real header, so
// the checks read the same thing they would read from a real file.
// ---------------------------------------------------------------------------

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real, decodable PNG of the given size in one flat colour, padded to `padTo` bytes with a text chunk. */
function png(width, height, { padTo = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x4a)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', pixels)];
  const size = parts.reduce((total, part) => total + part.length, 0) + 12;
  if (padTo > size) parts.push(chunk('tEXt', Buffer.alloc(padTo - size - 12, 0x61)));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function riff(chunkType, payload) {
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), Buffer.from(chunkType, 'ascii'), Buffer.alloc(4), payload]);
  body.writeUInt32LE(payload.length, 8);
  const head = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4)]);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Lossy WebP: a frame tag, the start code, then the two 14-bit sizes. */
function webpLossy(width, height) {
  const payload = Buffer.alloc(30);
  payload.set([0x9d, 0x01, 0x2a], 3);
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);
  return riff('VP8 ', payload);
}

/** Lossless WebP: the 2F signature, then width and height minus one in 14 bits each. */
function webpLossless(width, height) {
  const payload = Buffer.alloc(20);
  payload[0] = 0x2f;
  payload.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
  return riff('VP8L', payload);
}

/** A JPEG with an APP0 segment before its start-of-frame, as a camera writes one. */
function jpeg(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof.set([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

const b64 = (buffer) => buffer.toString('base64');
const putLogo = (token, slot, image, reason = 'The cafe logo') =>
  request('PUT', `/api/v1/settings/appearance/logo/${slot}`, { token, body: { reason, image } });
const deleteLogo = (token, slot, reason = 'Replacing it') =>
  request('DELETE', `/api/v1/settings/appearance/logo/${slot}`, { token, body: { reason } });
const fetchLogo = (token, slot, headers = {}) =>
  fetch(`${baseUrl}/api/v1/restaurant/logo/${slot}`, { headers: { Authorization: `Bearer ${token}`, ...headers } });

describe('the logo: what is accepted', () => {
  const accepted = [
    ['a PNG', () => png(447, 285), 'image/png', 447, 285],
    ['a lossy WebP', () => webpLossy(600, 400), 'image/webp', 600, 400],
    ['a lossless WebP', () => webpLossless(256, 1024), 'image/webp', 256, 1024],
    ['a JPEG', () => jpeg(512, 128), 'image/jpeg', 512, 128],
  ];

  for (const slot of ['LIGHT_GROUND', 'DARK_GROUND']) {
    for (const [what, build, contentType, width, height] of accepted) {
      it(`takes ${what} in ${slot}, measured from its header, and serves it back`, async () => {
        const { tokens } = await seedTeam();
        const file = build();
        const saved = await putLogo(tokens.OWNER, slot, b64(file));
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        assert.equal(saved.body.data.slot, slot);
        assert.equal(saved.body.data.contentType, contentType);
        assert.equal(saved.body.data.width, width);
        assert.equal(saved.body.data.height, height);
        assert.equal(saved.body.data.sizeBytes, file.length);

        // Every role may read it, with its own type and the hash as the ETag.
        const served = await fetchLogo(tokens.KITCHEN, slot);
        assert.equal(served.status, 200);
        assert.equal(served.headers.get('content-type'), contentType);
        assert.equal(served.headers.get('etag'), `"${saved.body.data.hash}"`);
        assert.match(served.headers.get('cache-control'), /private/);
        assert.deepEqual(Buffer.from(await served.arrayBuffer()), file);
      });
    }
  }

  it('answers 304 to the hash it already has, and ignores a data URL prefix', async () => {
    const { tokens } = await seedTeam();
    const saved = await putLogo(tokens.OWNER, 'DARK_GROUND', `data:image/svg+xml;base64,${b64(png(300, 200))}`);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.contentType, 'image/png');
    const again = await fetchLogo(tokens.WAITER, 'DARK_GROUND', { 'If-None-Match': `"${saved.body.data.hash}"` });
    assert.equal(again.status, 304);
  });
});

describe('the logo: what is refused', () => {
  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="200" height="200"/></svg>');
  const refused = [
    ['an SVG', b64(svg), /This is an SVG\. Upload a PNG, WebP or JPEG instead\./],
    ['a bare SVG with no XML line', b64(Buffer.from('  <svg viewBox="0 0 10 10"></svg>')), /This is an SVG/],
    ['a text file renamed .png', b64(Buffer.from('logo.png is really just text')), /not a PNG, WebP or JPEG image/],
    ['text that is not base64', 'not base64 at all!', /not a PNG, WebP or JPEG image/],
    ['a PNG signature with no header', b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), /not a PNG, WebP or JPEG image/],
    ['a file over 200 KB', b64(png(400, 400, { padTo: 205 * 1024 })), /This image is 205 KB\. The largest allowed is 200 KB\./],
    ['an image over 1024 pixels', b64(png(2048, 300)), /This image is 2048 pixels wide\. The largest allowed is 1024\./],
    ['an image under 128 pixels', b64(png(500, 96)), /This image is 96 pixels tall\. The smallest allowed is 128\./],
  ];

  for (const slot of ['LIGHT_GROUND', 'DARK_GROUND']) {
    for (const [what, image, message] of refused) {
      it(`refuses ${what} in ${slot}, naming the field in plain words`, async () => {
        const { tokens } = await seedTeam();
        const response = await putLogo(tokens.OWNER, slot, image);
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, 'VALIDATION_FAILED');
        assert.match(response.body.error.fields.image, message);
        assert.equal((await fetchLogo(tokens.OWNER, slot)).status, 404);
      });
    }
  }

  it('refuses a slot that does not exist, and a missing reason', async () => {
    const { tokens } = await seedTeam();
    assert.equal((await putLogo(tokens.OWNER, 'MIDDLE_GROUND', b64(png(200, 200)))).status, 400);
    assert.equal((await putLogo(tokens.OWNER, 'DARK_GROUND', b64(png(200, 200)), '')).status, 400);
    assert.equal((await deleteLogo(tokens.OWNER, 'DARK_GROUND', '')).status, 400);
  });

  it('keeps every other route at the 100 KB body limit', async () => {
    const { tokens } = await seedTeam();
    const response = await request('PATCH', '/api/v1/settings', {
      token: tokens.OWNER,
      body: { reason: 'x'.repeat(150 * 1024), appearance: { neutralTone: 'WARM' } },
    });
    // The error handler answers an oversized body as a 400 that says so.
    assert.equal(response.status, 400);
    assert.equal(response.body.error.message, 'That request was too large.');
  });
});

describe('the logo: who may change it', () => {
  it('lets only the owner set or remove a logo, and every role read it', async () => {
    const { tokens } = await seedTeam();
    for (const role of ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'STOREKEEPER']) {
      assert.equal((await putLogo(tokens[role], 'DARK_GROUND', b64(png(200, 200)))).status, 403, role);
    }
    assert.equal((await putLogo(tokens.OWNER, 'DARK_GROUND', b64(png(200, 200)))).status, 200);
    for (const role of ['MANAGER', 'WAITER']) {
      assert.equal((await deleteLogo(tokens[role], 'DARK_GROUND')).status, 403, role);
    }
    for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'STOREKEEPER']) {
      assert.equal((await fetchLogo(tokens[role], 'DARK_GROUND')).status, 200, role);
    }
    const anonymous = await fetch(`${baseUrl}/api/v1/restaurant/logo/DARK_GROUND`);
    assert.equal(anonymous.status, 401);
  });

  it('gives restaurant B a 404, never a 403, for the logo restaurant A set', async () => {
    const a = await seedTeam();
    const b = await seedTeam();
    assert.equal((await putLogo(a.tokens.OWNER, 'DARK_GROUND', b64(png(200, 200)))).status, 200);
    const asB = await fetchLogo(b.tokens.OWNER, 'DARK_GROUND');
    assert.equal(asB.status, 404);
    // And the removal B can send cannot reach the logo A set either.
    assert.equal((await deleteLogo(b.tokens.OWNER, 'DARK_GROUND')).status, 404);
    assert.equal((await fetchLogo(a.tokens.WAITER, 'DARK_GROUND')).status, 200);
  });
});

describe('the logo: what it leaves behind', () => {
  it('audits a set and a removal with slot, hash, size, dimensions, type and reason, never the bytes', async () => {
    const { tokens, restaurant } = await seedTeam();
    const file = png(447, 285);
    const saved = (await putLogo(tokens.OWNER, 'DARK_GROUND', b64(file), 'The cafe logo')).body.data;

    // The same file again is not a change and writes nothing.
    assert.equal((await putLogo(tokens.OWNER, 'DARK_GROUND', b64(file))).status, 200);

    const removed = await deleteLogo(tokens.OWNER, 'DARK_GROUND', 'Wrong file');
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.data, { slot: 'DARK_GROUND', removed: true });
    assert.equal((await fetchLogo(tokens.OWNER, 'DARK_GROUND')).status, 404);
    assert.equal((await deleteLogo(tokens.OWNER, 'DARK_GROUND')).status, 404);

    const lines = await AuditLog.find({ restaurantId: restaurant._id, action: { $in: ['BRAND_LOGO_SET', 'BRAND_LOGO_REMOVED'] } })
      .sort({ at: 1 })
      .lean();
    assert.deepEqual(lines.map((line) => line.action), ['BRAND_LOGO_SET', 'BRAND_LOGO_REMOVED']);
    const expected = { slot: 'DARK_GROUND', hash: saved.hash, sizeBytes: file.length, width: 447, height: 285, contentType: 'image/png' };
    assert.deepEqual(lines[0].details, expected);
    assert.deepEqual(lines[1].details, expected);
    assert.equal(lines[0].reason, 'The cafe logo');
    assert.equal(lines[1].reason, 'Wrong file');
    assert.equal(lines[0].entityType, 'SETTINGS');
    assert.equal(lines[0].entityLabel, 'DARK_GROUND');
    assert.ok(!JSON.stringify(lines).includes(b64(file).slice(0, 40)), 'no image bytes in the audit trail');

    // The owner reads them on the activity log.
    const today = businessDateFor(new Date());
    const feed = await request('GET', `/api/v1/audit?from=${today}&to=${today}&action=BRAND_LOGO_SET`, { token: tokens.OWNER });
    assert.equal(feed.status, 200, JSON.stringify(feed.body));
    assert.ok(feed.body.data.some((line) => line.action === 'BRAND_LOGO_SET'));
  });

  it('puts hashes, tone and brand colours on /auth/me, and bytes nowhere but the logo endpoint', async () => {
    const { tokens } = await seedTeam();
    const file = png(447, 285);
    const saved = (await putLogo(tokens.OWNER, 'DARK_GROUND', b64(file))).body.data;
    await patchAppearance(tokens.OWNER, { neutralTone: 'WARM', brandHex: LOGO_BROWN, onBrandHex: '#F2D7BC' });

    const me = await request('GET', '/api/v1/auth/me', { token: tokens.CASHIER });
    assert.deepEqual(me.body.data.appearance.logos, {
      LIGHT_GROUND: null,
      DARK_GROUND: { hash: saved.hash, contentType: 'image/png', width: 447, height: 285 },
    });
    assert.equal(me.body.data.appearance.neutralTone, 'WARM');
    assert.equal(me.body.data.appearance.brandHex, LOGO_BROWN);

    const marker = b64(file).slice(0, 40);
    for (const path of ['/api/v1/auth/me', '/api/v1/restaurant', '/api/v1/settings']) {
      const response = await request('GET', path, { token: tokens.OWNER });
      assert.equal(response.status, 200, path);
      const text = JSON.stringify(response.body);
      assert.ok(!text.includes(marker), `${path} carries no image bytes`);
      assert.ok(!text.includes('brandLogos'), `${path} carries no brandLogos`);
    }
  });

  it('never loads the bytes when reading the restaurant the ordinary way', async () => {
    const { tokens, restaurant } = await seedTeam();
    await putLogo(tokens.OWNER, 'DARK_GROUND', b64(png(447, 285)));
    const plain = await Restaurant.findById(restaurant._id).lean();
    assert.equal(plain.brandLogos.darkGround.data, undefined);
    assert.ok(plain.brandLogos.darkGround.sha256);
  });
});
