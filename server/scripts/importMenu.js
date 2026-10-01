/**
 * Imports a menu from a CSV file. P11. Phase 2 onboarding.
 *
 *   npm run import:menu -- --file setup/caffeza-menu.csv --owner-phone 98xxxxxxxx
 *   npm run import:menu -- --file setup/caffeza-menu.csv --owner-phone 98xxxxxxxx --apply
 *   ... --addons setup/caffeza-addons.csv --config setup/caffeza.json
 *
 * The same sign-in, dry run, --apply and summary as setupRestaurant.js, and
 * the same promise: through the API only, safe to run again, nothing deleted
 * or switched off. Items already on the menu but not in the file are listed
 * and left alone.
 *
 * The file:
 *
 *   category,item,size,price,gst_percent,available
 *   Italian Coffees,Caffe Latte,,220.00,5,yes
 *   Pizza,Margherita,Regular,280.00,5,yes
 *   Pizza,Margherita,Large,420.00,5,yes
 *
 * Lines starting with # are comments. Prices are rupees with up to two
 * decimals, converted by rupeesToPaise. GST is 0, 5, 12, 18 or 28 percent and
 * becomes basis points. Rows with the same category and item and a size become
 * one item with sizes; the item's own price is its first size's. If any row
 * has a problem, every problem is reported by line and nothing is written.
 *
 * With --config, categories are routed to stations by the setup file's
 * `categoryStations` and `defaultStation`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { rupeesToPaise } from '../utils/money.js';
import { applySteps, countSteps, formatPlan, parseArgs, startOwnerSession } from './lib/scriptApi.js';
import { planCategoryRouting, validateSetupConfig } from './setupRestaurant.js';

const MENU_HEADER = ['category', 'item', 'size', 'price', 'gst_percent', 'available'];
const ADDON_HEADER = ['item', 'addon', 'price', 'available'];
const GST_PERCENTS = new Set(['0', '5', '12', '18', '28']);
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

/* ------------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------------ */

/**
 * Splits CSV text into rows of fields, keeping each row's line number. Handles
 * quoted fields with commas, doubled quotes and line breaks inside quotes.
 * Blank lines and lines starting with # are skipped.
 */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let fields = [];
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const source = text.replace(/^﻿/, '');

  const endRow = () => {
    fields.push(field);
    const blank = fields.length === 1 && fields[0].trim() === '';
    const comment = fields[0].trimStart().startsWith('#');
    if (!blank && !comment) rows.push({ line: rowLine, fields: fields.map((value) => value.trim()) });
    field = '';
    fields = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) endRow();
  return rows;
}

function readHeader(rows, expected, errors) {
  const [header, ...rest] = rows;
  if (!header || header.fields.map((value) => value.toLowerCase()).join(',') !== expected.join(',')) {
    errors.push({ line: header?.line ?? 1, message: `The first row must be the header: ${expected.join(',')}` });
    return [];
  }
  return rest;
}

const yesNo = (value) => {
  const text = value.toLowerCase();
  if (text === 'yes' || text === 'y') return true;
  if (text === 'no' || text === 'n') return false;
  return null;
};

function readPrice(value, line, errors) {
  if (!PRICE_PATTERN.test(value)) {
    errors.push({ line, message: `Price "${value}" must be rupees with up to two decimals, like 220.00.` });
    return null;
  }
  return rupeesToPaise(value);
}

/**
 * The menu file, as items grouped by category in file order. Returns
 * `{ categories: [{ name, items: [...] }], errors: [{ line, message }] }`.
 */
export function parseMenuCsv(text) {
  const errors = [];
  const rows = readHeader(parseCsv(text), MENU_HEADER, errors);
  const categories = [];
  const byCategory = new Map();
  const byItem = new Map();

  for (const { line, fields } of rows) {
    if (fields.length !== MENU_HEADER.length) {
      errors.push({ line, message: `Expected ${MENU_HEADER.length} values, found ${fields.length}.` });
      continue;
    }
    const [category, item, size, price, gst, available] = fields;
    const before = errors.length;
    if (!category) errors.push({ line, message: 'The category is missing.' });
    if (!item) errors.push({ line, message: 'The item name is missing.' });
    const priceInPaise = readPrice(price, line, errors);
    if (!GST_PERCENTS.has(gst)) errors.push({ line, message: `GST "${gst}" must be 0, 5, 12, 18 or 28.` });
    const isAvailable = yesNo(available);
    if (isAvailable === null) errors.push({ line, message: `Available "${available}" must be yes or no.` });
    if (errors.length > before) continue;

    const taxRateBps = Number(gst) * 100;
    const key = `${category.toLowerCase()}\u0000${item.toLowerCase()}`;
    let entry = byItem.get(key);
    if (!entry) {
      if (!byCategory.has(category.toLowerCase())) {
        const group = { name: category, items: [] };
        byCategory.set(category.toLowerCase(), group);
        categories.push(group);
      }
      entry = { name: item, category, line, priceInPaise, taxRateBps, isAvailable, sized: Boolean(size), variants: [], addOns: [] };
      byItem.set(key, entry);
      byCategory.get(category.toLowerCase()).items.push(entry);
    } else {
      if (entry.sized !== Boolean(size)) {
        errors.push({ line, message: `"${item}" mixes rows with and without a size.` });
        continue;
      }
      if (!size) {
        errors.push({ line, message: `"${item}" appears twice in "${category}" with no size.` });
        continue;
      }
      if (entry.taxRateBps !== taxRateBps) {
        errors.push({ line, message: `Every size of "${item}" must have the same GST.` });
        continue;
      }
    }
    if (size) {
      if (entry.variants.some((variant) => variant.name.toLowerCase() === size.toLowerCase())) {
        errors.push({ line, message: `"${item}" has the size "${size}" twice.` });
        continue;
      }
      entry.variants.push({ name: size, priceInPaise, isAvailable });
      // The item's own price is its first size's; it is available if any size is.
      entry.priceInPaise = entry.variants[0].priceInPaise;
      entry.isAvailable = entry.variants.some((variant) => variant.isAvailable);
    }
  }

  return { categories, errors };
}

/** The add-ons file. Each add-on joins its item by name. */
export function parseAddonsCsv(text, menu) {
  const errors = [];
  const rows = readHeader(parseCsv(text), ADDON_HEADER, errors);
  const items = menu.categories.flatMap((category) => category.items);

  for (const { line, fields } of rows) {
    if (fields.length !== ADDON_HEADER.length) {
      errors.push({ line, message: `Expected ${ADDON_HEADER.length} values, found ${fields.length}.` });
      continue;
    }
    const [itemName, addon, price, available] = fields;
    const before = errors.length;
    const matches = items.filter((entry) => entry.name.toLowerCase() === itemName.toLowerCase());
    if (matches.length === 0) errors.push({ line, message: `"${itemName}" is not in the menu file.` });
    if (matches.length > 1) errors.push({ line, message: `"${itemName}" is in more than one category; it is ambiguous.` });
    if (!addon) errors.push({ line, message: 'The add-on name is missing.' });
    const priceInPaise = readPrice(price, line, errors);
    const isAvailable = yesNo(available);
    if (isAvailable === null) errors.push({ line, message: `Available "${available}" must be yes or no.` });
    if (errors.length > before) continue;
    if (matches[0].addOns.some((existing) => existing.name.toLowerCase() === addon.toLowerCase())) {
      errors.push({ line, message: `"${itemName}" has the add-on "${addon}" twice.` });
      continue;
    }
    matches[0].addOns.push({ name: addon, priceInPaise, isAvailable });
  }
  return { errors };
}

export class MenuFileError extends Error {
  constructor(errors) {
    super(`The menu file has ${errors.length} problem${errors.length === 1 ? '' : 's'}. Nothing was written.\n${errors.map((error) => `  line ${error.line}: ${error.message}`).join('\n')}`);
    this.name = 'MenuFileError';
    this.errors = errors;
  }
}

/** Reads both files, throwing MenuFileError listing every problem. */
export function readMenu(menuText, addonsText = null) {
  const menu = parseMenuCsv(menuText);
  const errors = [...menu.errors];
  if (addonsText !== null) errors.push(...parseAddonsCsv(addonsText, menu).errors);
  if (errors.length > 0) throw new MenuFileError(errors.sort((a, b) => a.line - b.line));
  return menu;
}

/* ------------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------------ */

const lower = (text) => String(text).trim().toLowerCase();

/** The variants or add-ons to send: matched by name keeps the id, new ones have none. */
function subdocuments(existing, wanted) {
  return wanted.map((entry) => {
    const match = existing.find((row) => lower(row.name) === lower(entry.name));
    return { ...(match ? { id: match.id } : {}), name: entry.name, priceInPaise: entry.priceInPaise, isAvailable: entry.isAvailable };
  });
}

const subdocumentsDiffer = (existing, wanted) =>
  existing.length !== wanted.length ||
  wanted.some((entry) => {
    const match = existing.find((row) => lower(row.name) === lower(entry.name));
    return !match || match.priceInPaise !== entry.priceInPaise || match.isAvailable !== entry.isAvailable;
  });

/**
 * What importing the menu would do, as steps. Categories are created in file
 * order; items are matched by name within their category.
 */
export async function planMenu(client, menu, { config = null } = {}) {
  const steps = [];
  const [categories, items, stations] = await Promise.all([
    client.get('/categories?includeInactive=true'),
    client.getAll('/menu-items?includeInactive=true'),
    client.get('/stations?includeInactive=true'),
  ]);

  const stationIds = new Map(stations.map((station) => [lower(station.name), station.id]));
  const stationId = (name) => stationIds.get(lower(name)) ?? null;
  const categoryIds = new Map(categories.map((category) => [lower(category.name), category.id]));
  const routed = new Set();

  menu.categories.forEach((group, index) => {
    if (categoryIds.has(lower(group.name))) {
      steps.push({ section: 'Categories', name: group.name, action: 'unchanged' });
      return;
    }
    const wantedStation = config ? (config.categoryStations?.[group.name] ?? config.defaultStation) : null;
    routed.add(lower(group.name));
    steps.push({
      section: 'Categories',
      name: group.name,
      action: 'create',
      detail: wantedStation ? `station ${wantedStation}` : undefined,
      run: async () => {
        const created = await client.post('/categories', { name: group.name, displayOrder: index });
        categoryIds.set(lower(created.name), created.id);
        if (wantedStation && stationId(wantedStation)) {
          await client.patch(`/categories/${created.id}`, { stationId: stationId(wantedStation) });
        }
        return created;
      },
    });
  });

  // Existing categories are routed too, so running the import with --config fixes their stations.
  if (config) {
    const existing = categories.filter((category) => menu.categories.some((group) => lower(group.name) === lower(category.name)));
    steps.push(...planCategoryRouting(client, existing, config, { stationId, stationIds }).filter((step) => step.action !== 'unchanged'));
  }

  const inFile = new Set();
  for (const group of menu.categories) {
    group.items.forEach((item, position) => {
      const categoryId = categoryIds.get(lower(group.name));
      const existing = categoryId
        ? items.find((row) => row.categoryId === categoryId && lower(row.name) === lower(item.name))
        : null;
      const label = `${group.name} / ${item.name}`;
      if (existing) inFile.add(existing.id);

      if (!existing) {
        steps.push({
          section: 'Items',
          name: label,
          action: 'create',
          detail: item.variants.length ? `${item.variants.length} sizes` : undefined,
          run: async () => {
            const created = await client.post('/menu-items', {
              categoryId: categoryIds.get(lower(group.name)),
              name: item.name,
              priceInPaise: item.priceInPaise,
              taxRateBps: item.taxRateBps,
              displayOrder: position,
              ...(item.variants.length ? { variants: subdocuments([], item.variants) } : {}),
              ...(item.addOns.length ? { addOns: subdocuments([], item.addOns) } : {}),
            });
            if (!item.isAvailable) {
              await client.patch(`/menu-items/${created.id}/availability`, { isAvailable: false });
            }
            return created;
          },
        });
        return;
      }

      const changes = {};
      if (existing.priceInPaise !== item.priceInPaise) changes.priceInPaise = item.priceInPaise;
      if (existing.taxRateBps !== item.taxRateBps) changes.taxRateBps = item.taxRateBps;
      if (subdocumentsDiffer(existing.variants ?? [], item.variants)) changes.variants = subdocuments(existing.variants ?? [], item.variants);
      if (item.addOns.length && subdocumentsDiffer(existing.addOns ?? [], item.addOns)) {
        changes.addOns = subdocuments(existing.addOns ?? [], item.addOns);
      }
      const availabilityChanged = existing.isAvailable !== item.isAvailable;
      if (Object.keys(changes).length === 0 && !availabilityChanged) {
        steps.push({ section: 'Items', name: label, action: 'unchanged' });
        return;
      }
      steps.push({
        section: 'Items',
        name: label,
        action: 'update',
        detail: [...Object.keys(changes), ...(availabilityChanged ? ['available'] : [])].join(', '),
        run: async () => {
          if (Object.keys(changes).length > 0) await client.patch(`/menu-items/${existing.id}`, changes);
          if (availabilityChanged) {
            await client.patch(`/menu-items/${existing.id}/availability`, { isAvailable: item.isAvailable });
          }
        },
      });
    });
  }

  for (const item of items) {
    if (inFile.has(item.id) || !item.isActive) continue;
    const category = categories.find((row) => row.id === item.categoryId);
    steps.push({ section: 'Not in this file, left alone', name: `${category?.name ?? '?'} / ${item.name}`, action: 'note' });
  }

  return steps;
}

/** Applies the plan and returns the counts. */
export async function applyMenu(steps) {
  await applySteps(steps);
  return countSteps(steps);
}

/* ------------------------------------------------------------------------ *
 * The command line
 * ------------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) throw new Error('Give the menu file with --file, for example --file setup/caffeza-menu.csv.');
  const read = (file) => readFileSync(path.resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8');
  const menu = readMenu(read(args.file), args.addons ? read(args.addons) : null);
  const config = args.config ? validateSetupConfig(JSON.parse(read(args.config))).config : null;

  const session = await startOwnerSession(args['owner-phone']);
  try {
    console.log(`\nRestaurant: ${session.restaurantName}`);
    const steps = await planMenu(session.client, menu, { config });
    console.log(formatPlan(steps));
    const counts = countSteps(steps);
    if (!args.apply) {
      console.log(`\nDry run. Nothing was changed. Would create ${counts.create}, update ${counts.update}, leave ${counts.unchanged} as they are.`);
      console.log('Run again with --apply to make these changes.');
      return;
    }
    const done = await applyMenu(steps);
    console.log(`\nDone. Created ${done.create}, updated ${done.update}, unchanged ${done.unchanged}.`);
  } finally {
    await session.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  });
}
