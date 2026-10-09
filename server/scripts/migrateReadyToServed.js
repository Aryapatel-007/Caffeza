/**
 * One time, for P29 Part C: order lines a kitchen marked ready before the
 * kitchen's ready meant served.
 *
 *   npm run migrate:ready-to-served              a dry run: counts, changes nothing
 *   npm run migrate:ready-to-served -- --apply   writes
 *
 * For every restaurant with `kitchen.readyMeansServed` on (the default), every
 * order line still READY on an order that is OPEN or READY_TO_BILL becomes
 * SERVED, with `servedAt` its `readyAt`. An OPEN order whose live lines are
 * then all served becomes READY_TO_BILL, through the same readyToBillChange as
 * a waiter's serve. Statuses only: no figure, price or bill changes, and a
 * second run finds nothing to do. docs/DB-SCHEMA.md section 43.
 */
import { pathToFileURL } from 'node:url';

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Order, ORDER_LINE_STATUSES, ORDER_STATUSES } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { isReadyToBill, readyToBillChange } from '../services/orderService.js';
import { nowUtc } from '../utils/time.js';

const OPEN_STATUSES = [ORDER_STATUSES.OPEN, ORDER_STATUSES.READY_TO_BILL];

/**
 * Returns `{ restaurants: [{ restaurantId, name, linesServed, ordersReadyToBill }], apply }`.
 * Writes only with `apply`.
 */
export async function migrateReadyToServed({ apply = false } = {}) {
  // `restaurants` is the tenancy root, read by its own documents: the one place every restaurant is listed.
  const restaurants = await Restaurant.find({}).select('name settings.kitchen').lean();
  const report = [];

  for (const restaurant of restaurants) {
    if (restaurant.settings?.kitchen?.readyMeansServed === false) continue;
    const restaurantId = restaurant._id;
    const orders = await Order.find({ restaurantId, status: { $in: OPEN_STATUSES }, 'lines.status': ORDER_LINE_STATUSES.READY })
      .select('status lines.status lines.readyAt lines._id')
      .lean();

    let linesServed = 0;
    let ordersReadyToBill = 0;
    for (const order of orders) {
      const ready = order.lines.filter((line) => line.status === ORDER_LINE_STATUSES.READY);
      linesServed += ready.length;
      const after = order.lines.map((line) => (line.status === ORDER_LINE_STATUSES.READY ? { status: ORDER_LINE_STATUSES.SERVED } : line));
      const closes = order.status === ORDER_STATUSES.OPEN && isReadyToBill(after);
      if (closes) ordersReadyToBill += 1;
      if (!apply) continue;

      const at = nowUtc();
      const $set = {};
      ready.forEach((line, index) => {
        $set[`lines.$[r${index}].status`] = ORDER_LINE_STATUSES.SERVED;
        $set[`lines.$[r${index}].servedAt`] = line.readyAt ?? at;
      });
      if (closes) Object.assign($set, readyToBillChange(at));
      await Order.updateOne(
        { restaurantId, _id: order._id, status: order.status },
        { $set, $inc: { version: 1 } },
        { arrayFilters: ready.map((line, index) => ({ [`r${index}._id`]: line._id, [`r${index}.status`]: ORDER_LINE_STATUSES.READY })) },
      );
    }
    if (orders.length > 0) report.push({ restaurantId: String(restaurantId), name: restaurant.name, linesServed, ordersReadyToBill });
  }
  return { restaurants: report, apply };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Moving ready lines to served.' : 'Dry run: nothing is written. Add --apply to write.');
  await connectDatabase();
  try {
    const { restaurants } = await migrateReadyToServed({ apply });
    if (restaurants.length === 0) console.log('Nothing to do: no ready lines on open orders.');
    for (const row of restaurants) {
      console.log(`${row.name}: ${row.linesServed} ready lines ${apply ? 'served' : 'to serve'}, ${row.ordersReadyToBill} orders ${apply ? 'moved' : 'to move'} to ready to bill.`);
    }
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await main();
