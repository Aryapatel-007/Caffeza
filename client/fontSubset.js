/**
 * The second-language fonts, cut down to the words the app writes. P32.
 *
 * Anek Gujarati's Gujarati file is 450 kB and Anek Devanagari's Devanagari
 * file 726 kB, while the app writes a few dozen fixed words in them: the
 * action words in `src/features/i18n/gu.js` and `hi.js`, and two lines on the
 * attendance clock. So every build and every dev start reads all of `src/`,
 * finds each word in each script, and makes a subset of each variable font
 * (both axes kept) holding exactly what those words need.
 *
 * Why not just their characters: a subset made from characters alone keeps
 * every conjunct those characters could form with each other, and with the
 * virama in the list that is most of the font (Gujarati only fell from 450 kB
 * to 326 kB). Leaving the conjuncts out breaks the words that use them. So
 * each word is shaped with HarfBuzz, as a browser would, at the corners of
 * both axes, and the subset keeps the characters plus every glyph the shaping
 * touched on the way, the steps in between included.
 *
 * Then every word is shaped again with the subset and compared with the full
 * font, glyph outline by glyph outline and position by position. Any
 * difference fails the build, naming the word and its file: a broken word on a
 * cashier's screen is worse than a failed build. Built every time rather than
 * checked in, so a word added tomorrow is in tomorrow's subset.
 *
 * Each subset keeps its script's `unicode-range` from @fontsource, so the
 * browser fetches it only when a Gujarati or Devanagari glyph is drawn: a
 * restaurant with no second language downloads neither. Text a person typed
 * in those scripts, outside these words, falls back to the device's own font.
 *
 * The output goes to `src/fonts/generated/` (git-ignored) and `main.jsx`
 * imports its CSS. Runs in Node, from `vite.config.js`.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import fontverter from 'fontverter';
import { Blob, Buffer as ShapingBuffer, Face, Font, shape, shapeWithTrace, Variation } from 'harfbuzzjs';

const require = createRequire(import.meta.url);

/** Beside the words in a bilingual line. Drawn by Anek Latin first; kept so the subset is never short of one. */
const BESIDE = '0123456789 .,:;!?()-/%';

/** Zero-width joiner and non-joiner: part of a word, never a break in one. */
const JOINERS = new Set([0x200c, 0x200d]);

export const FACES = Object.freeze([
  Object.freeze({
    family: 'Anek Gujarati Variable',
    // The Gujarati block, and the dandas Gujarati text borrows from Devanagari.
    script: (codePoint) => (codePoint >= 0x0a80 && codePoint <= 0x0aff) || codePoint === 0x0964 || codePoint === 0x0965,
    source: '@fontsource-variable/anek-gujarati/files/anek-gujarati-gujarati-standard-normal.woff2',
    output: 'anek-gujarati-subset.woff2',
    // As @fontsource-variable/anek-gujarati/standard.css declares it.
    unicodeRange: 'U+0951-0952,U+0964-0965,U+0A80-0AFF,U+200C-200D,U+20B9,U+25CC,U+A830-A839',
  }),
  Object.freeze({
    family: 'Anek Devanagari Variable',
    script: (codePoint) => codePoint >= 0x0900 && codePoint <= 0x097f,
    source: '@fontsource-variable/anek-devanagari/files/anek-devanagari-devanagari-standard-normal.woff2',
    output: 'anek-devanagari-subset.woff2',
    // As @fontsource-variable/anek-devanagari/standard.css declares it.
    unicodeRange: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09',
  }),
]);

/** The corners and middle of both axes, so a glyph used only at one weight or width is kept. */
const VARIATIONS = [100, 500, 800].flatMap((wght) => [75, 100, 125].map((wdth) => ({ wght, wdth })));
const settingsFor = ({ wght, wdth }) => [new Variation('wght', wght), new Variation('wdth', wdth)];

const SOURCE_FILE = /\.(jsx?|css)$/;

/** Every source file under `dir`, the generated folder left out. */
async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'generated') files.push(...(await sourceFiles(full)));
    } else if (SOURCE_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Every word in one script across the texts, each with the files it is in. A word is a run of the script's characters and joiners. */
export function scriptWords(texts, script) {
  const words = new Map();
  for (const { file, text } of texts) {
    let word = '';
    const flush = () => {
      if ([...word].some((char) => script(char.codePointAt(0)))) {
        if (!words.has(word)) words.set(word, new Set());
        words.get(word).add(file);
      }
      word = '';
    };
    for (const char of text) {
      const codePoint = char.codePointAt(0);
      if (script(codePoint) || (word && JOINERS.has(codePoint))) word += char;
      else flush();
    }
    flush();
  }
  return words;
}

// --- HarfBuzz's subsetter, driven directly, as subset-font does ---------------

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
const HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE = 0x00000200;

let subsetter = null;
async function loadSubsetter() {
  if (!subsetter) {
    const { instance } = await WebAssembly.instantiate(await readFile(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')));
    instance.exports._initialize();
    subsetter = instance.exports;
  }
  return subsetter;
}

/** A TrueType subset holding `codePoints` and `glyphIds`, every layout feature kept, with no closure over the layout. */
async function subsetTrueType(trueType, codePoints, glyphIds) {
  const hb = await loadSubsetter();
  const heap = () => new Uint8Array(hb.memory.buffer);
  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error('HarfBuzz could not start a subset.');
  const fontPointer = hb.malloc(trueType.byteLength);
  heap().set(trueType, fontPointer);
  const blob = hb.hb_blob_create(fontPointer, trueType.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  try {
    const features = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
    hb.hb_set_clear(features);
    hb.hb_set_invert(features);
    hb.hb_subset_input_set_flags(input, hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE);
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const codePoint of codePoints) hb.hb_set_add(unicodes, codePoint);
    const glyphs = hb.hb_subset_input_glyph_set(input);
    for (const glyphId of glyphIds) hb.hb_set_add(glyphs, glyphId);

    const subset = hb.hb_subset_or_fail(face, input);
    if (subset === 0) throw new Error('HarfBuzz could not make the subset.');
    const result = hb.hb_face_reference_blob(subset);
    const offset = hb.hb_blob_get_data(result, 0);
    const bytes = Buffer.from(heap().subarray(offset, offset + hb.hb_blob_get_length(result)));
    hb.hb_blob_destroy(result);
    hb.hb_face_destroy(subset);
    return bytes;
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(fontPointer);
  }
}

// --- Shaping, as a browser would ----------------------------------------------

function fontFrom(sfnt) {
  return new Font(new Face(new Blob(sfnt), 0));
}

function newBuffer(word) {
  const buffer = new ShapingBuffer();
  buffer.addText(word);
  buffer.guessSegmentProperties();
  return buffer;
}

/** Every glyph id shaping `word` touches, from the first substitution to the final positions. */
function glyphsTouched(font, word) {
  const touched = new Set();
  for (const step of shapeWithTrace(font, newBuffer(word), [], 0, 0)) {
    if (!step.glyphs) continue;
    for (const glyph of step.t) if (typeof glyph.g === 'number') touched.add(glyph.g);
  }
  return touched;
}

/** What a word looks like when drawn: each glyph's outline and where it sits. Glyph ids differ between fonts; this does not. */
function drawn(font, word) {
  const buffer = newBuffer(word);
  shape(font, buffer);
  return buffer
    .getGlyphInfosAndPositions()
    .map((glyph) => `${font.glyphToPath(glyph.codepoint)}@${glyph.xAdvance},${glyph.xOffset},${glyph.yOffset}`)
    .join('|');
}

const hex = (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;

/** One subset: its bytes, and every word checked against the full font. */
async function subsetFace(face, words, clientDir) {
  const original = await readFile(require.resolve(face.source, { paths: [clientDir] }));
  const full = await fontverter.convert(original, 'truetype');
  const fullFont = fontFrom(full);

  const codePoints = new Set([...BESIDE].map((char) => char.codePointAt(0)));
  const glyphIds = new Set();
  for (const word of words.keys()) {
    for (const char of word) codePoints.add(char.codePointAt(0));
    for (const variation of VARIATIONS) {
      fullFont.setVariations(settingsFor(variation));
      for (const glyphId of glyphsTouched(fullFont, word)) glyphIds.add(glyphId);
    }
  }

  const subset = await subsetTrueType(full, codePoints, glyphIds);
  const subsetFont = fontFrom(subset);
  const held = new Set(subsetFont.face.collectUnicodes());
  const problems = [];
  for (const [word, files] of words) {
    const missing = [...word].map((char) => char.codePointAt(0)).filter((codePoint) => !JOINERS.has(codePoint) && !held.has(codePoint));
    if (missing.length > 0) {
      problems.push(`${word} in ${[...files].join(', ')}: ${face.family} has no ${missing.map(hex).join(', ')}`);
      continue;
    }
    for (const variation of VARIATIONS) {
      fullFont.setVariations(settingsFor(variation));
      subsetFont.setVariations(settingsFor(variation));
      if (drawn(fullFont, word) !== drawn(subsetFont, word)) {
        problems.push(`${word} in ${[...files].join(', ')}: the subset draws it differently at weight ${variation.wght}, width ${variation.wdth}`);
        break;
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`The second-language font subset cannot draw every word.\n  ${problems.join('\n  ')}`);
  }
  return { bytes: await fontverter.convert(subset, 'woff2', 'truetype'), originalBytes: original.byteLength };
}

/** Builds both subsets and the CSS that declares them, and returns what it wrote. */
export async function buildSubsets({ clientDir }) {
  const srcDir = path.join(clientDir, 'src');
  const outDir = path.join(srcDir, 'fonts', 'generated');
  const texts = await Promise.all(
    (await sourceFiles(srcDir)).map(async (file) => ({ file: path.relative(clientDir, file), text: await readFile(file, 'utf8') })),
  );

  const css = ['/* Made by client/fontSubset.js on every build and dev start. Do not edit. */'];
  const written = [];
  for (const face of FACES) {
    const words = scriptWords(texts, face.script);
    const { bytes, originalBytes } = await subsetFace(face, words, clientDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, face.output), bytes);
    written.push({ file: face.output, words: words.size, bytes: bytes.byteLength, originalBytes });
    css.push(`@font-face {
  font-family: '${face.family}';
  font-style: normal;
  font-display: swap;
  font-weight: 100 800;
  font-stretch: 75% 125%;
  src: url(./${face.output}) format('woff2-variations');
  unicode-range: ${face.unicodeRange};
}`);
  }

  await writeFile(path.join(outDir, 'second-language.css'), `${css.join('\n\n')}\n`);
  return written;
}

/** The Vite plugin: makes the subsets before anything is bundled or served. */
export function secondLanguageFonts({ clientDir }) {
  return {
    name: 'second-language-fonts',
    async buildStart() {
      for (const entry of await buildSubsets({ clientDir })) {
        const line = `${entry.file}: ${entry.words} words, ${(entry.bytes / 1000).toFixed(2)} kB, from ${(entry.originalBytes / 1000).toFixed(2)} kB`;
        if (typeof this.info === 'function') this.info(line);
        else console.log(line);
      }
    },
  };
}
