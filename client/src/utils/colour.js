/**
 * Colour arithmetic for the restaurant's accent. P20A.
 * docs/DESIGN-SYSTEM-V2.md sections 4c and 13.
 *
 * MIRROR of server/utils/colour.js, used only to preview and explain on the
 * settings screen before saving. The server validates and computes; this file
 * never decides anything. A server test runs both on the same 50 colours.
 * NO IMPORTS, so the mirror can stay identical.
 */

/** Day `ground` and night `ground`, the two surfaces an accent must read on. */
export const DAY_GROUND = '#F2F4F3';
export const NIGHT_GROUND = '#0F1715';

/** The five fixed state colours' text and edge values, day. An accent must not look like one. */
export const STATE_COLOURS = Object.freeze({
  open: '#7A4F00',
  served: '#16614F',
  bill: '#922457',
  alert: '#A8321C',
  ok: '#256640',
});

/** The six accent presets, day values. Night values come from nightVariant. */
export const ACCENT_PRESETS = Object.freeze({
  OCEAN: '#1C5C86',
  INDIGO: '#3446A8',
  PLUM: '#6A3878',
  OLIVE: '#4F6328',
  ESPRESSO: '#55473F',
  GRAPHITE: '#343B41',
});

export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_GROUND_CONTRAST = 3;
export const MIN_HUE_DISTANCE = 30;
export const LOW_SATURATION = 0.25;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** "#1C5C86" as { r, g, b }, 0 to 255, or null when it is not six-digit hex. */
export function parseHex(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

const toHexPart = (value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0').toUpperCase();

export function toHex({ r, g, b }) {
  return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`;
}

/** WCAG relative luminance, 0 to 1. */
export function relativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** { h, s, l }: hue in degrees 0 to 360, saturation and lightness 0 to 1. */
export function toHsl(hex) {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/** HSL back to a hex colour, each channel rounded to the nearest whole number. */
export function fromHsl({ h, s, l }) {
  if (s === 0) return toHex({ r: l * 255, g: l * 255, b: l * 255 });
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const hn = h / 360;
  return toHex({ r: hue(hn + 1 / 3) * 255, g: hue(hn) * 255, b: hue(hn - 1 / 3) * 255 });
}

/** The shorter way round the colour wheel between two hues, 0 to 180. */
export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The night variant of an accent: its HSL lightness raised by 0.01 at a time,
 * from its own, until it reaches 4.5 to 1 against night `ground`. A colour
 * that already reads on night ground is returned as it is.
 */
export function nightVariant(hex) {
  const { h, s, l } = toHsl(hex);
  let lightness = l;
  let candidate = toHex(parseHex(hex));
  while (contrastRatio(candidate, NIGHT_GROUND) < MIN_TEXT_CONTRAST && lightness < 1) {
    lightness = Math.min(1, Math.round((lightness + 0.01) * 100) / 100);
    candidate = fromHsl({ h, s, l: lightness });
  }
  return candidate;
}

/** The preset whose hue is nearest, for a refused colour's suggestion. */
export function nearestPreset(hex) {
  const { h } = toHsl(hex);
  let best = null;
  for (const [name, value] of Object.entries(ACCENT_PRESETS)) {
    const distance = hueDistance(h, toHsl(value).h);
    if (!best || distance < best.distance) best = { name, value, distance };
  }
  return best.name;
}

const PRESET_WORDS = { OCEAN: 'Ocean', INDIGO: 'Indigo', PLUM: 'Plum', OLIVE: 'Olive', ESPRESSO: 'Espresso', GRAPHITE: 'Graphite' };
const STATE_WORDS = { open: 'Open', served: 'Served', bill: 'Bill printed', alert: 'Late', ok: 'Paid' };

/**
 * Checks an owner's accent against the four rules in DESIGN-SYSTEM-V2 4c.
 * Returns { ok: true } or { ok: false, rule, message, nearestPreset }.
 */
export function checkAccent(hex) {
  if (!parseHex(hex)) {
    return { ok: false, rule: 'FORMAT', message: 'Enter a six-digit colour, like #2D5DA8.', nearestPreset: 'OCEAN' };
  }
  const suggestion = nearestPreset(hex);
  const tryInstead = `Try ${PRESET_WORDS[suggestion]} instead.`;
  if (contrastRatio('#FFFFFF', hex) < MIN_TEXT_CONTRAST) {
    return { ok: false, rule: 'TEXT_CONTRAST', message: `White text on this colour is too faint to read. ${tryInstead}`, nearestPreset: suggestion };
  }
  if (contrastRatio(hex, DAY_GROUND) < MIN_GROUND_CONTRAST) {
    return { ok: false, rule: 'GROUND_CONTRAST', message: `This colour is too light to stand out on the page. ${tryInstead}`, nearestPreset: suggestion };
  }
  const { h, s } = toHsl(hex);
  if (s >= LOW_SATURATION) {
    for (const [state, value] of Object.entries(STATE_COLOURS)) {
      if (hueDistance(h, toHsl(value).h) < MIN_HUE_DISTANCE) {
        return {
          ok: false,
          rule: 'STATE_HUE',
          message: `This colour is too close to the ${STATE_WORDS[state]} state, so a button could look like a table's state. ${tryInstead}`,
          nearestPreset: suggestion,
        };
      }
    }
  }
  return { ok: true };
}

export default { checkAccent, contrastRatio, nearestPreset, nightVariant, parseHex, toHsl };
