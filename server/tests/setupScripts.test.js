/**
 * The restaurant setup script and the menu import. P11.
 *
 * The parsing and planning are tested as plain functions; applying a plan runs
 * against the in-memory database through the real API, exactly as the scripts
 * do when signed in as the owner.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ALL_MODELS } from '../models/index.js';
import { MenuItem } from '../models/MenuItem.js';
import { Station } from '../models/Station.js';
import { Table } from '../models/Table.js';
import { User } from '../models/User.js';
import { applyMenu, MenuFileError, parseCsv, planMenu, readMenu } from '../scripts/importMenu.js';
import { apiClient, countSteps } from '../scripts/lib/scriptApi.js';
import { applySetup, planSetup, SetupConfigError, validateSetupConfig } from '../scripts/setupRestaurant.js';
import { seedTeam } from './helpers/m2Fixtures.js';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from './helpers/testDatabase.js';
import { request, startTestServer, stopTestServer } from './helpers/testServer.js';

const SETUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'setup');
const caffezaConfig = () => JSON.parse(readFileSync(path.join(SETUP_DIR, 'caffeza.json'), 'utf8'));
const caffezaMenu = () => readFileSync(path.join(SETUP_DIR, 'caffeza-menu.csv'), 'utf8');

/** The test server's request already prefixes nothing; the scripts' paths are under /api/v1. */
const send = (method, pathname, options) => request(method, `/api/v1${pathname}`, options);

before(async () => {
  await startTestDatabase();
  await startTestServer();
  for (const model of ALL_MODELS) await model.init();
});

after(async () => {
  await stopTestServer();
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

async function ownerClient() {
  const team = await seedTeam();
  return { ...team, client: apiClient(send, team.tokens.OWNER) };
}

const fullConfig = () => ({
  restaurant: { name: 'Test Cafe', gstin: '24AARFT4546K1ZM', address: { city: 'Gandhinagar', state: 'Gujarat' }, legalName: 'TO CONFIRM' },
  settings: {
    businessDayStartsAtMinutes: 300,
    features: { inventory: false, attendance: false },
    delivery: { platformCollectsGst: true },
    discounts: { cashierMayApplyPlatformDiscounts: false },
    dayClose: { showCashDifferenceToManager: false },
  },
  stations: [
    { name: 'Live Kitchen', displayOrder: 0, printsTickets: false },
    { name: 'Beverages', displayOrder: 1, printsTickets: false },
  ],
  categoryStations: { 'Italian Coffees': 'Beverages' },
  defaultStation: 'Live Kitchen',
  tables: { section: 'Cafe', names: ['Table 1', 'Table 2'], seats: 4 },
  paymentMethods: [
    { code: 'CASH', name: 'Cash', kind: 'IN_HAND', tallyLedgerCode: 'P01', displayOrder: 0 },
    { code: 'ZOMATO_GOLD', name: 'Zomato Gold', kind: 'PLATFORM', orderTypes: ['DINE_IN'], tallyLedgerCode: '645', commissionBps: 'TO CONFIRM', displayOrder: 3 },
  ],
  accounts: [{ name: 'E-210 Office', openingBalanceInPaise: 'TO CONFIRM' }],
  staff: [
    { name: 'Khuman Singh', phone: '9812345601', role: 'WAITER' },
    { name: 'Live Kitchen', phone: '9812345602', role: 'KITCHEN', station: 'Live Kitchen' },
    { name: 'Ratandip', phone: 'TO CONFIRM', role: 'WAITER' },
  ],
});

const SECTION_7A = `category,item,size,price,gst_percent,available
Italian Coffees,Caffe Latte,,220.00,5,yes
Pizza,Half & Half Pizza,,380.00,5,yes
Cold Beverages,Water Bottle,,47.61,5,yes
Pizza,Margherita,Regular,280.00,5,yes
Pizza,Margherita,Large,420.00,5,yes
`;

// ---------------------------------------------------------------------------

describe('the setup file', () => {
  it('applies every section to a fresh restaurant, and a second run changes nothing', async () => {
    const { client, restaurant } = await ownerClient();
    const { config, toConfirm } = validateSetupConfig(fullConfig());

    const first = await planSetup(client, config, { toConfirm });
    const { counts, logins } = await applySetup(first);
    assert.ok(counts.create > 0);
    assert.deepEqual(logins.map((login) => login.name).sort(), ['Khuman Singh', 'Live Kitchen']);
    for (const login of logins) assert.ok(login.password.length >= 8);

    assert.equal(await Table.countDocuments({ restaurantId: restaurant._id }), 2);
    assert.equal(await Station.countDocuments({ restaurantId: restaurant._id }), 2);
    const kitchen = await User.findOne({ restaurantId: restaurant._id, name: 'Live Kitchen' });
    const liveKitchen = await Station.findOne({ restaurantId: restaurant._id, name: 'Live Kitchen' });
    assert.equal(String(kitchen.stationId), String(liveKitchen._id));

    const settings = await client.get('/settings');
    assert.equal(settings.features.inventory, false);
    const methods = await client.get('/payment-methods');
    assert.equal(methods.find((method) => method.code === 'CASH').tallyLedgerCode, 'P01');
    assert.equal(methods.find((method) => method.code === 'ZOMATO_GOLD').commissionBps, null);

    const second = await planSetup(client, config, { toConfirm });
    const changes = second.filter((step) => step.action === 'create' || step.action === 'update');
    assert.deepEqual(changes, [], JSON.stringify(changes.map((step) => [step.section, step.name, step.detail])));
  });

  it('skips and lists every TO CONFIRM value, and does not create a staff member with no phone', async () => {
    const { client, restaurant } = await ownerClient();
    const { config, toConfirm } = validateSetupConfig(fullConfig());
    assert.deepEqual(toConfirm.sort(), [
      'accounts[0].openingBalanceInPaise',
      'paymentMethods[1].commissionBps',
      'restaurant.legalName',
      'staff[2].phone',
    ]);

    const steps = await planSetup(client, config, { toConfirm });
    const ratandip = steps.find((step) => step.name === 'Ratandip');
    assert.equal(ratandip.action, 'skip');
    assert.equal(steps.filter((step) => step.section === 'Still TO CONFIRM, not sent').length, 4);

    await applySetup(steps);
    assert.equal(await User.countDocuments({ restaurantId: restaurant._id, name: 'Ratandip' }), 0);
    const profile = await client.get('/restaurant');
    assert.notEqual(profile.legalName, 'TO CONFIRM');
  });

  it('refuses a file that sets the invoice series, and lists every problem at once', () => {
    const withInvoice = { ...fullConfig(), settings: { ...fullConfig().settings, invoice: { mode: 'PREFIX' } } };
    assert.throws(() => validateSetupConfig(withInvoice), (error) => {
      assert.ok(error instanceof SetupConfigError);
      assert.ok(error.issues.some((issue) => issue.path === 'settings.invoice'));
      return true;
    });

    const broken = fullConfig();
    broken.tables.seats = 0;
    broken.staff[0].role = 'CHEF';
    broken.categoryStations.Pizza = 'Wood Oven';
    assert.throws(() => validateSetupConfig(broken), (error) => {
      assert.ok(error.issues.length >= 3, JSON.stringify(error.issues));
      return true;
    });
  });

  it('a dry run changes nothing in the database', async () => {
    const { client, restaurant } = await ownerClient();
    const { config, toConfirm } = validateSetupConfig(fullConfig());
    const before = await Promise.all(ALL_MODELS.map((model) => model.countDocuments({ restaurantId: restaurant._id }).catch(() => 0)));
    await planSetup(client, config, { toConfirm });
    const afterPlan = await Promise.all(ALL_MODELS.map((model) => model.countDocuments({ restaurantId: restaurant._id }).catch(() => 0)));
    // Listing payment methods creates the four built-ins on first use, which P08 does for every read.
    const paymentMethodsIndex = ALL_MODELS.findIndex((model) => model.modelName === 'PaymentMethod');
    before[paymentMethodsIndex] = afterPlan[paymentMethodsIndex];
    assert.deepEqual(afterPlan, before);
  });
});

describe('the menu import', () => {
  it('reads the section 7a file into categories, items, sizes, paise and basis points', async () => {
    const menu = readMenu(SECTION_7A);
    assert.deepEqual(menu.categories.map((category) => category.name), ['Italian Coffees', 'Pizza', 'Cold Beverages']);
    const pizza = menu.categories[1].items;
    assert.deepEqual(pizza.map((item) => item.name), ['Half & Half Pizza', 'Margherita']);
    assert.equal(pizza[1].priceInPaise, 28000);
    assert.deepEqual(pizza[1].variants.map((variant) => [variant.name, variant.priceInPaise]), [['Regular', 28000], ['Large', 42000]]);
    assert.equal(menu.categories[2].items[0].priceInPaise, 4761);
    assert.equal(menu.categories[0].items[0].taxRateBps, 500);

    const { client, restaurant } = await ownerClient();
    await applyMenu(await planMenu(client, menu));
    const water = await MenuItem.findOne({ restaurantId: restaurant._id, name: 'Water Bottle' });
    assert.equal(water.priceInPaise, 4761);
    assert.equal(water.taxRateBps, 500);
    const margherita = await MenuItem.findOne({ restaurantId: restaurant._id, name: 'Margherita' });
    assert.deepEqual(margherita.variants.map((variant) => variant.priceInPaise), [28000, 42000]);
  });

  it('parses a quoted name containing a comma, and skips comment lines', () => {
    const rows = parseCsv('# a comment, with a comma\ncategory,item\nPizza,"Paneer, Corn and Onion Pizza"\n');
    assert.deepEqual(rows.map((row) => row.fields), [['category', 'item'], ['Pizza', 'Paneer, Corn and Onion Pizza']]);
    const menu = readMenu('category,item,size,price,gst_percent,available\nPizza,"Paneer, Corn Pizza",,300.00,5,yes\n');
    assert.equal(menu.categories[0].items[0].name, 'Paneer, Corn Pizza');
  });

  it('reports a bad price, a GST of 7 and a missing category by line, before anything is written', () => {
    const text = `category,item,size,price,gst_percent,available
Pizza,Margherita,,two hundred,5,yes
Pizza,Farmhouse,,300.00,7,yes
,Orphan,,100.00,5,yes
Pizza,Good One,,100.00,5,yes
`;
    assert.throws(() => readMenu(text), (error) => {
      assert.ok(error instanceof MenuFileError);
      assert.deepEqual(error.errors.map((entry) => entry.line), [2, 3, 4]);
      return true;
    });
  });

  it('re-importing with one price changed updates only that item', async () => {
    const { client } = await ownerClient();
    await applyMenu(await planMenu(client, readMenu(SECTION_7A)));
    const changed = SECTION_7A.replace('Caffe Latte,,220.00', 'Caffe Latte,,230.00');
    const steps = await planMenu(client, readMenu(changed));
    const updates = steps.filter((step) => step.action === 'update' || step.action === 'create');
    assert.deepEqual(updates.map((step) => [step.name, step.detail]), [['Italian Coffees / Caffe Latte', 'priceInPaise']]);
    await applyMenu(steps);
    const again = await planMenu(client, readMenu(changed));
    assert.equal(countSteps(again).update + countSteps(again).create, 0);
  });
});

describe('Caffeza\'s own files', () => {
  it('both pass validation in a dry run, with 34 tables, 2 stations, 8 payment methods and 2 accounts', async () => {
    const { config, toConfirm } = validateSetupConfig(caffezaConfig());
    assert.equal(config.tables.names.length, 34);
    assert.equal(config.tables.names.includes('Table 13'), false);
    assert.equal(config.stations.length, 2);
    assert.equal(config.paymentMethods.length, 8);
    assert.equal(config.accounts.length, 2);
    assert.ok(toConfirm.length > 0);

    const menu = readMenu(caffezaMenu());
    assert.ok(menu.categories.length > 10);

    const { client } = await ownerClient();
    const steps = await planSetup(client, config, { toConfirm });
    assert.equal(steps.filter((step) => step.section === 'Tables').length, 34);
    await planMenu(client, menu, { config });
  });

  it('applied to a fresh restaurant: 34 active tables in Cafe, and Italian Coffees routed to Beverages', async () => {
    const { client, restaurant } = await ownerClient();
    const { config, toConfirm } = validateSetupConfig(caffezaConfig());
    await applySetup(await planSetup(client, config, { toConfirm }));
    await applyMenu(await planMenu(client, readMenu(caffezaMenu()), { config }));

    assert.equal(await Table.countDocuments({ restaurantId: restaurant._id, isActive: true, section: 'Cafe' }), 34);
    const categories = await client.get('/categories');
    const stations = await client.get('/stations');
    const beverages = stations.find((station) => station.name === 'Beverages');
    const liveKitchen = stations.find((station) => station.name === 'Live Kitchen');
    assert.equal(categories.find((category) => category.name === 'Italian Coffees').stationId, beverages.id);
    assert.equal(categories.find((category) => category.name === 'Pizza').stationId, liveKitchen.id);

    const water = await MenuItem.findOne({ restaurantId: restaurant._id, name: 'Water Bottle' });
    assert.equal(water.priceInPaise, 4761);

    // No staff were created: every phone is still TO CONFIRM.
    assert.equal(await User.countDocuments({ restaurantId: restaurant._id, name: 'Counter' }), 0);
  });
});
