/**
 * P35 Part B: `npm run menu:sizes-to-dishes`, an item's sizes made into
 * dishes of their own. docs/prompts/P35-same-dish-once-and-drinks-as-dishes.md
 * sections B1 to B7.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import mongoose from 'mongoose';

import { ALL_MODELS } from '../models/index.js';
import { MenuItem } from '../models/MenuItem.js';
import { MenuPhoto } from '../models/MenuPhoto.js';
import { PlatformItemMapping } from '../models/PlatformItemMapping.js';
import { Recipe } from '../models/Recipe.js';
import { formatReport, parseArgs, sizesToDishes, SizesToDishesError } from '../scripts/sizesToDishes.js';
import { createCategory, createMenuItem, createTable, fireOrder, openOrder, readOrder, seedFloor } from './helpers/m2Fixtures.js';
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

const ok = (response, what) => {
  assert.ok(response.status >= 200 && response.status < 300, `${what}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
};

const SIZES = ['Sprite', 'Diet Coke', 'Coke', 'Thums Up'];
let restaurants = 0;

/**
 * A restaurant whose Beverages read Water Bottle, Aerated Drinks (four sizes
 * at ₹70, Diet Coke switched off, one extra), then Butter Milk.
 */
async function drinksRestaurant({ name } = {}) {
  restaurants += 1;
  const restaurantName = name ?? `Drinks Corner ${restaurants}`;
  const floor = await seedFloor({ name: restaurantName });
  const owner = floor.tokens.OWNER;
  const category = ok(await createCategory(owner, { name: 'Beverages' }), 'category');
  ok(await createMenuItem(owner, { categoryId: category.id, name: 'Water Bottle', priceInPaise: 5000, displayOrder: 0 }), 'water');
  const drinks = ok(
    await createMenuItem(owner, {
      categoryId: category.id,
      name: 'Aerated Drinks',
      priceInPaise: 7000,
      displayOrder: 1,
      variants: SIZES.map((size) => ({ name: size, priceInPaise: 7000 })),
      addOns: [{ name: 'Lemon', priceInPaise: 1000 }],
    }),
    'drinks',
  );
  ok(await createMenuItem(owner, { categoryId: category.id, name: 'Butter Milk', priceInPaise: 9000, displayOrder: 2 }), 'butter milk');
  await MenuItem.updateOne({ restaurantId: floor.restaurant._id, _id: drinks.id, 'variants.name': 'Diet Coke' }, { $set: { 'variants.$.isAvailable': false } });
  const size = (sizeName) => drinks.variants.find((variant) => variant.name === sizeName);
  return { ...floor, restaurantName, restaurantId: floor.restaurant._id, branchId: floor.branch._id, category, drinks, size };
}

const run = (shop, options = {}) => sizesToDishes({ restaurant: shop.restaurantName, item: 'Aerated Drinks', apply: true, ...options });

/** Every collection's count, to prove a run wrote nothing. */
async function countEverything() {
  const counts = {};
  for (const { name } of await mongoose.connection.db.listCollections().toArray()) {
    counts[name] = await mongoose.connection.db.collection(name).countDocuments();
  }
  return counts;
}

/** A restaurant's menu items as stored, for a before-and-after comparison. */
const menuOf = (shop) => MenuItem.find({ restaurantId: shop.restaurantId }).sort({ _id: 1 }).lean();

/** The category as the menu shows it: switched-on dishes, in menu order. */
const beverages = (shop) =>
  MenuItem.find({ restaurantId: shop.restaurantId, categoryId: shop.category.id, isActive: true }).sort({ displayOrder: 1, name: 1 }).lean();

/** Fires the order's unsent lines and lets the kitchen make every ticket; the kitchen's ready serves them. */
async function sendAndMake(shop, order) {
  const fired = ok(await fireOrder(shop.tokens.WAITER, order.id, order.version), 'fire');
  for (const kot of fired.kots) ok(await request('PATCH', `/api/v1/kots/${kot.id}/ready`, { token: shop.tokens.KITCHEN }), 'ready');
  return ok(await readOrder(shop.tokens.WAITER, order.id), 'read');
}

const bill = async (shop, order) =>
  ok(await request('POST', '/api/v1/bills', { token: shop.tokens.CASHIER, body: { orderId: order.id, version: order.version } }), 'bill');

describe('menu:sizes-to-dishes', () => {
  it('makes each size its own dish at its own price, and switches the old item off', async () => {
    const shop = await drinksRestaurant();
    const report = await run(shop);

    const dishes = await MenuItem.find({ restaurantId: shop.restaurantId, name: { $in: SIZES } }).lean();
    assert.equal(dishes.length, 4);
    for (const dish of dishes) {
      assert.equal(String(dish.categoryId), shop.category.id);
      assert.equal(dish.priceInPaise, 7000);
      assert.equal(dish.taxRateBps, 500);
      assert.equal(dish.isActive, true);
      assert.deepEqual(dish.variants, []);
      assert.deepEqual(dish.addOns.map((addOn) => [addOn.name, addOn.priceInPaise]), [['Lemon', 1000]]);
      assert.notEqual(String(dish.addOns[0]._id), shop.drinks.addOns[0].id, 'the extras are copies with new ids');
      assert.equal(dish.isAvailable, dish.name !== 'Diet Coke', `${dish.name} keeps its size's availability`);
    }
    const old = await MenuItem.findOne({ restaurantId: shop.restaurantId, _id: shop.drinks.id }).lean();
    assert.equal(old.isActive, false, 'switched off');
    assert.equal(old.variants.length, 4, 'and otherwise untouched, never deleted');

    const printed = formatReport(report).join('\n');
    assert.match(printed, /Coke {2}₹70\.00 {2}GST 5% {2}available/);
    assert.match(printed, /Diet Coke {2}₹70\.00 {2}GST 5% {2}not available/);
    assert.match(printed, /Aerated Drinks is switched off, not deleted/);
  });

  it('puts the new dishes where the old item sat, in the order of its sizes', async () => {
    const shop = await drinksRestaurant();
    const report = await run(shop);
    assert.deepEqual((await beverages(shop)).map((dish) => dish.name), ['Water Bottle', ...SIZES, 'Butter Milk']);
    assert.deepEqual(report.movedDown, { names: ['Butter Milk'], by: 3 });

    // And the menu every screen reads says the same, Diet Coke left out while it is off.
    const menu = ok(await request('GET', '/api/v1/menu', { token: shop.tokens.WAITER }), 'menu');
    const section = menu.find((category) => category.id === shop.category.id);
    assert.deepEqual(section.items.map((item) => item.name), ['Water Bottle', 'Sprite', 'Coke', 'Thums Up', 'Butter Milk']);
  });

  it("gives a size's recipe to its dish, and a copy of the item's recipe to a size without one", async () => {
    const shop = await drinksRestaurant();
    const cokeSyrup = new mongoose.Types.ObjectId();
    const ice = new mongoose.Types.ObjectId();
    const base = { restaurantId: shop.restaurantId, branchId: shop.branchId, menuItemId: shop.drinks.id };
    await Recipe.create({ ...base, variantId: shop.size('Coke').id, items: [{ ingredientId: cokeSyrup, qtyInBase: 300 }] });
    await Recipe.create({ ...base, variantId: null, items: [{ ingredientId: ice, qtyInBase: 50 }] });

    const report = await run(shop);
    const recipeOf = async (name) => {
      const dish = await MenuItem.findOne({ restaurantId: shop.restaurantId, name }).lean();
      return Recipe.find({ restaurantId: shop.restaurantId, menuItemId: dish._id }).lean();
    };
    const [coke] = await recipeOf('Coke');
    assert.equal(coke.variantId, null, 'an item-level recipe');
    assert.deepEqual(coke.items.map((item) => [String(item.ingredientId), item.qtyInBase]), [[String(cokeSyrup), 300]]);
    for (const name of ['Sprite', 'Diet Coke', 'Thums Up']) {
      const recipes = await recipeOf(name);
      assert.equal(recipes.length, 1, name);
      assert.deepEqual(recipes[0].items.map((item) => [String(item.ingredientId), item.qtyInBase]), [[String(ice), 50]], name);
    }
    assert.deepEqual(report.dishes.find((dish) => dish.name === 'Coke').recipe, { from: 'size', ingredients: 1 });
    assert.deepEqual(report.dishes.find((dish) => dish.name === 'Sprite').recipe, { from: 'item', ingredients: 1 });
  });

  it('moves a mapping on a size to its dish, and leaves a mapping with no size alone and listed', async () => {
    const shop = await drinksRestaurant();
    const connectionId = new mongoose.Types.ObjectId();
    const base = { restaurantId: shop.restaurantId, branchId: shop.branchId, connectionId, menuItemId: shop.drinks.id };
    const onCoke = await PlatformItemMapping.create({
      ...base,
      externalItemId: 'z-coke',
      externalName: 'Coke 300 ml',
      variantId: shop.size('Coke').id,
      addOnMap: { 'z-lemon': shop.drinks.addOns[0].id },
    });
    const noSize = await PlatformItemMapping.create({ ...base, externalItemId: 'z-drinks', externalName: 'Cold drink', variantId: null });

    const report = await run(shop);
    const coke = await MenuItem.findOne({ restaurantId: shop.restaurantId, name: 'Coke' }).lean();
    const moved = await PlatformItemMapping.findOne({ restaurantId: shop.restaurantId, _id: onCoke._id }).lean();
    assert.equal(String(moved.menuItemId), String(coke._id));
    assert.equal(moved.variantId, null);
    assert.deepEqual(moved.addOnMap, { 'z-lemon': String(coke.addOns[0]._id) }, "the extra follows to the new dish's copy");

    const untouched = await PlatformItemMapping.findOne({ restaurantId: shop.restaurantId, _id: noSize._id }).lean();
    assert.equal(String(untouched.menuItemId), shop.drinks.id);
    assert.equal(untouched.variantId, null);
    assert.deepEqual(report.mappingsLeftAlone, [{ label: 'A platform: Cold drink', reason: 'it points at the item with no size' }]);
    assert.match(formatReport(report).join('\n'), /left alone[\s\S]*Cold drink/);
  });

  it("copies the old item's photo to each new dish", async () => {
    const shop = await drinksRestaurant();
    await MenuPhoto.create({
      restaurantId: shop.restaurantId,
      branchId: shop.branchId,
      menuItemId: shop.drinks.id,
      contentType: 'image/png',
      data: Buffer.from('a small png'),
      sha256: 'a'.repeat(64),
      width: 10,
      height: 10,
      sizeBytes: 11,
      setBy: shop.user._id,
      setAt: new Date('2026-10-09T10:00:00Z'),
    });
    await run(shop);
    for (const name of SIZES) {
      const dish = await MenuItem.findOne({ restaurantId: shop.restaurantId, name }).lean();
      const photo = await MenuPhoto.findOne({ restaurantId: shop.restaurantId, menuItemId: dish._id }).lean();
      assert.ok(photo, name);
      assert.equal(photo.sha256, 'a'.repeat(64));
      assert.equal(Buffer.from(photo.data.buffer ?? photo.data).toString(), 'a small png');
    }
    assert.equal(await MenuPhoto.countDocuments({ restaurantId: shop.restaurantId, menuItemId: shop.drinks.id }), 1, "the old item's photo stays");
  });

  it('writes nothing on a dry run', async () => {
    const shop = await drinksRestaurant();
    await Recipe.create({ restaurantId: shop.restaurantId, branchId: shop.branchId, menuItemId: shop.drinks.id, variantId: null, items: [] });
    const counts = await countEverything();
    const menu = await menuOf(shop);

    const report = await run(shop, { apply: false });
    assert.equal(report.dishes.length, 4);
    assert.deepEqual(await countEverything(), counts);
    assert.deepEqual(await menuOf(shop), menu);
    assert.match(formatReport(report).join('\n'), /Aerated Drinks will be switched off/);
  });

  it('writes nothing at all when a step fails halfway', async () => {
    const shop = await drinksRestaurant();
    await Recipe.create({ restaurantId: shop.restaurantId, branchId: shop.branchId, menuItemId: shop.drinks.id, variantId: null, items: [] });
    const counts = await countEverything();
    const menu = await menuOf(shop);
    const realCreate = Recipe.create;
    let calls = 0;
    Recipe.create = function failingOnTheThird(...args) {
      calls += 1;
      if (calls === 3) throw new Error('the database went away');
      return realCreate.apply(this, args);
    };
    try {
      await assert.rejects(run(shop), /the database went away/);
    } finally {
      Recipe.create = realCreate;
    }
    assert.ok(calls >= 3, 'two dishes were already written when it failed');
    assert.deepEqual(await countEverything(), counts);
    assert.deepEqual(await menuOf(shop), menu);
  });

  it('says there is nothing to do on a second run, and writes nothing', async () => {
    const shop = await drinksRestaurant();
    await run(shop);
    const counts = await countEverything();
    const menu = await menuOf(shop);
    for (const apply of [false, true]) {
      const report = await run(shop, { apply });
      assert.deepEqual(formatReport(report), ['Nothing to do: Aerated Drinks is already switched off.']);
    }
    assert.deepEqual(await countEverything(), counts);
    assert.deepEqual(await menuOf(shop), menu);
  });

  it('refuses a size named like another dish, switched off or on, names it, and writes nothing', async () => {
    const shop = await drinksRestaurant();
    const other = ok(await createMenuItem(shop.tokens.OWNER, { name: 'coke', priceInPaise: 6000 }), 'an old coke');
    await MenuItem.updateOne({ restaurantId: shop.restaurantId, _id: other.id }, { $set: { isActive: false } });
    const counts = await countEverything();
    const menu = await menuOf(shop);
    await assert.rejects(run(shop), (error) => error instanceof SizesToDishesError && /"coke" \(switched off\)/.test(error.message));
    assert.deepEqual(await countEverything(), counts);
    assert.deepEqual(await menuOf(shop), menu);
  });

  it('refuses the other cases in B5 before writing anything', async () => {
    const shop = await drinksRestaurant();
    const refused = (options, pattern) =>
      assert.rejects(sizesToDishes({ restaurant: shop.restaurantName, item: 'Aerated Drinks', apply: true, ...options }), (error) => error instanceof SizesToDishesError && pattern.test(error.message));

    await refused({ restaurant: 'Nowhere Cafe' }, /No restaurant is named "Nowhere Cafe"/);
    await refused({ item: 'Lassi' }, /No item in .* is named "Lassi"/);
    await refused({ item: 'Butter Milk' }, /Butter Milk has no sizes/);

    const twin = await drinksRestaurant({ name: 'Twin Cafe' });
    await drinksRestaurant({ name: 'Twin Cafe' });
    await assert.rejects(run(twin), /2 restaurants are named "Twin Cafe"/);

    const counts = await countEverything();
    await MenuItem.updateOne({ restaurantId: shop.restaurantId, _id: shop.drinks.id, 'variants.name': 'Thums Up' }, { $set: { 'variants.$.name': 'COKE' } });
    await refused({}, /Two sizes share a name: COKE/);
    await MenuItem.updateOne({ restaurantId: shop.restaurantId, _id: shop.drinks.id, 'variants.name': 'COKE' }, { $set: { 'variants.$.name': 'x'.repeat(101) } });
    await refused({}, /empty or longer than 100 characters/);
    assert.deepEqual(await countEverything(), counts);
    assert.equal((await MenuItem.findOne({ restaurantId: shop.restaurantId, _id: shop.drinks.id }).lean()).isActive, true);
  });

  it("never reads or changes another restaurant's item of the same name", async () => {
    const shop = await drinksRestaurant();
    const elsewhere = await drinksRestaurant();
    const theirs = await menuOf(elsewhere);
    const theirId = String(elsewhere.restaurantId);

    // Everything the script sends to the database, with sessions and the like left out.
    const sent = [];
    const plain = (value) =>
      JSON.stringify(value, (key, entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.constructor && entry.constructor !== Object ? undefined : entry));
    mongoose.set('debug', (collection, method, ...args) => sent.push(`${collection}.${method} ${plain(args)}`));
    try {
      await run(shop);
    } finally {
      mongoose.set('debug', false);
    }
    assert.ok(sent.some((line) => line.includes(String(shop.restaurantId))), "the capture sees this restaurant's own id");
    assert.deepEqual(sent.filter((line) => line.includes(theirId)), []);
    assert.deepEqual(await menuOf(elsewhere), theirs);
  });

  it('leaves an open order on the old item alone, and a new order bills the new dish by its own name', async () => {
    const shop = await drinksRestaurant();
    let before = ok(
      await openOrder(shop.tokens.WAITER, { tableId: shop.table.id, guestCount: 2, lines: [{ menuItemId: shop.drinks.id, variantId: shop.size('Coke').id, quantity: 1 }] }),
      'open before',
    );
    before = await sendAndMake(shop, before);

    await run(shop);

    const oldBill = await bill(shop, before);
    assert.deepEqual(
      oldBill.lines.map((line) => [line.itemName, line.variantName, line.unitPriceInPaise]),
      [['Aerated Drinks', 'Coke', 7000]],
    );

    const coke = await MenuItem.findOne({ restaurantId: shop.restaurantId, name: 'Coke' }).lean();
    const table = ok(await createTable(shop.tokens.OWNER, { name: 'T2' }), 'table 2');
    let after = ok(await openOrder(shop.tokens.WAITER, { tableId: table.id, guestCount: 1, lines: [{ menuItemId: String(coke._id), quantity: 1 }] }), 'open after');
    after = await sendAndMake(shop, after);
    const newBill = await bill(shop, after);
    assert.deepEqual(
      newBill.lines.map((line) => [line.itemName, line.variantName, line.unitPriceInPaise]),
      [['Coke', null, 7000]],
    );
  });
});

describe('the arguments', () => {
  it('takes --restaurant, --item and --apply, and refuses anything else', () => {
    assert.deepEqual(parseArgs(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks']), { restaurant: 'Z Chaat', item: 'Aerated Drinks', apply: false });
    assert.deepEqual(parseArgs(['--restaurant=Z Chaat', '--item=Aerated Drinks', '--apply']), { restaurant: 'Z Chaat', item: 'Aerated Drinks', apply: true });

    const refused = (argv, pattern) => assert.throws(() => parseArgs(argv), (error) => error instanceof SizesToDishesError && pattern.test(error.message));
    refused(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks', '--aply'], /Unknown argument: --aply/);
    refused(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks', '--force'], /Unknown argument: --force/);
    refused(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks', 'Coke'], /Unknown argument: Coke/);
    refused(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks', '--apply=yes'], /Unknown argument: --apply=yes/);
    refused(['--restaurant', 'Z Chaat', '--item', 'Aerated Drinks', '--item', 'Lassi'], /--item is given twice/);
    refused(['--item', 'Aerated Drinks'], /--restaurant needs a name/);
    refused(['--restaurant', '  ', '--item', 'Aerated Drinks'], /--restaurant needs a name/);
    refused(['--restaurant', 'Z Chaat', '--item', '--apply'], /--item needs a name/);
  });
});
