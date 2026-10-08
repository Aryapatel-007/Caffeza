/**
 * P25 B5. Nothing restaurant-specific in the code.
 *
 * The product serves any restaurant, so no client's name may be user-visible
 * text, a default value, a constant or a behaviour in `server/` or
 * `client/src/`. Comments describing history may name the first client, and
 * tests may use the golden day fixture, so both are left out of the search.
 * The two browser storage keys named before P25 are the only exceptions, for
 * the reason written beside each.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOTS = ['server', 'client/src'];
const SKIP_DIRS = new Set(['node_modules', 'tests', 'dist', 'coverage']);
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.css', '.html']);

/** Both spellings the first client's name was written in. */
const CLIENT_NAME = /caf+ez+a/i;

/** Storage keys that no person sees, kept so devices and guests keep their state. */
const ALLOWED = ["'caffeza.device'", "'caffeza.public.token.'"];

/** Code with its comments removed: block comments, JSX comments and line comments. */
export function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Lines of code that name the client, with the allowed keys taken out. */
export function offendingLines(source) {
  return withoutComments(source)
    .split('\n')
    .map((line) => ALLOWED.reduce((text, allowed) => text.replace(allowed, ''), line))
    .filter((line) => CLIENT_NAME.test(line));
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(path.join(dir, entry.name));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

describe('no client name in the code', () => {
  it('finds no client name outside comments, tests and the two storage keys', () => {
    const found = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(path.join(REPO, root))) {
        for (const line of offendingLines(readFileSync(file, 'utf8'))) {
          found.push(`${path.relative(REPO, file)}: ${line.trim()}`);
        }
      }
    }
    found.push(...offendingLines(readFileSync(path.join(REPO, 'client', 'index.html'), 'utf8')).map((line) => `client/index.html: ${line.trim()}`));
    assert.deepEqual(found, []);
  });

  it('would catch a name in text or a default, and not in a comment', () => {
    assert.equal(offendingLines("const title = 'Cafezza';").length, 1);
    assert.equal(offendingLines('<p>Welcome to Caffeza</p>').length, 1);
    assert.equal(offendingLines('const url = "https://caffeza.example.com"; // Caffeza').length, 1);
    assert.equal(offendingLines('// Caffeza asked for this\n/* Cafezza */ const a = 1;').length, 0);
    assert.equal(offendingLines("const KEY = 'caffeza.device';").length, 0);
  });
});
