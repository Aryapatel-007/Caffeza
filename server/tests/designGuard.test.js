/**
 * Design guard. P20A, DESIGN-SYSTEM-V2 section 13.
 *
 * Reads client source from disk and fails the build when a shared component
 * or a service screen:
 *   1. contains a raw hex colour (every colour is a token in index.css),
 *   2. uses a version 1 token class (`paper`, `steel`, `chana`, `mirch`,
 *      `patta`), or
 *   3. formats money anywhere but `Money`: no `toLocaleString` on a number,
 *      no `/ 100` beside a `₹`, and no call to version 1's `formatPaise`.
 *
 * P20B widens all three from these folders to the whole client.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SRC = path.resolve(SERVER_DIR, '..', 'client', 'src');

/** The shared components and the service screens P20A moved. */
const GUARDED = [
  'components',
  'features/orders',
  'features/kitchen',
  'features/billing',
  'features/settlement',
  'features/printing',
  'features/i18n',
];

/** The one component allowed to format money. */
const MONEY_COMPONENT = 'components/ui/Money.jsx';

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const relative = (file) => path.relative(CLIENT_SRC, file).split(path.sep).join('/');

/** Comments say what the colours were; only code is checked. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const files = GUARDED.flatMap((folder) => sourceFiles(path.join(CLIENT_SRC, folder))).map((file) => ({
  name: relative(file),
  code: withoutComments(readFileSync(file, 'utf8')),
}));

function offenders(pattern) {
  const found = [];
  for (const { name, code } of files) {
    code.split('\n').forEach((line, index) => {
      if (pattern.test(line)) found.push(`${name}:${index + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  return found;
}

const RAW_HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/;
const V1_TOKEN = /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|from|to|via|decoration|divide|accent|shadow|placeholder)-(?:paper|steel|chana|mirch|patta)(?![\w])|--color-(?:paper|steel|chana|mirch|patta)/;

describe('design guard: shared components and service screens', () => {
  it('guards a real set of files', () => {
    assert.ok(files.length > 40, `only ${files.length} files found under ${GUARDED.join(', ')}`);
  });

  it('contain no raw hex colour', () => {
    assert.deepEqual(offenders(RAW_HEX), []);
  });

  it('use no version 1 token class', () => {
    assert.deepEqual(offenders(V1_TOKEN), []);
  });

  it('format money only through Money', () => {
    const found = [];
    for (const { name, code } of files) {
      if (name === MONEY_COMPONENT) continue;
      code.split('\n').forEach((line, index) => {
        const where = `${name}:${index + 1}  ${line.trim().slice(0, 100)}`;
        if (/\.toLocaleString\(/.test(line)) found.push(where);
        if (/\/\s*100\b/.test(line) && /₹/.test(line)) found.push(where);
        if (/\bformatPaise\b/.test(line)) found.push(where);
      });
    }
    assert.deepEqual(found, []);
  });

  it('catch a planted raw colour, version 1 token and private money format', () => {
    // The patterns above are only worth anything if they match what they exist to stop.
    assert.ok(RAW_HEX.test('className="bg-[#c99a2e]"'));
    assert.ok(RAW_HEX.test("color: '#fff'"));
    assert.ok(!RAW_HEX.test('#{order.orderNumber}'));
    assert.ok(V1_TOKEN.test("'hover:bg-chana text-ink'"));
    assert.ok(V1_TOKEN.test('className="text-steel"'));
    assert.ok(V1_TOKEN.test('accent-[var(--color-chana)]'));
    assert.ok(!V1_TOKEN.test('className="text-muted bg-accent"'));
  });
});
