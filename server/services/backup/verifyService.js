/**
 * Checking a restored database. P54 Part E.
 *
 * Three checks, each in plain words, against the database the default
 * mongoose connection points at (the restore and practice restore connect it
 * to the restored database, never the live one):
 *   1. every collection's count is the one the restore worked out from the
 *      copy's manifest and the diary's inserts and deletes;
 *   2. every invoice series runs without a missing or repeated number, voided
 *      bills included, and its counter is at or above the highest number;
 *   3. C12 for the last 7 closed days: each Day Close snapshot equals the
 *      figures worked out again from the records, exactly as Day Close checks.
 */
import mongoose from 'mongoose';

import { Bill } from '../../models/Bill.js';
import { Counter } from '../../models/Counter.js';
import { DAY_STATUSES, DayClosure } from '../../models/DayClosure.js';
import { computeDayFigures, numberInSeries, seriesOf } from '../dayFiguresService.js';
import { checkC12 } from '../reconciliationService.js';

const FINANCIAL_YEAR = /^\d{4}-\d{2}$/;

/** Every collection's count against `expected` ({ name: count }). */
export async function checkCounts(expected) {
  const problems = [];
  const db = mongoose.connection.db;
  for (const [name, count] of Object.entries(expected ?? {})) {
    const actual = await db.collection(name).countDocuments();
    if (actual !== count) problems.push(`${name} has ${actual} documents; the backup says ${count}.`);
  }
  return problems;
}

/** Bill numbers per restaurant, branch and series: no gaps, no repeats, the counter not behind. */
export async function checkInvoiceSeries() {
  const problems = [];
  // The native collection, as a restore tool reading every restaurant at once:
  // a Mongoose query here would be refused by the tenant guard, rightly.
  const bills = await Bill.collection.find({}, { projection: { restaurantId: 1, branchId: 1, invoiceSeries: 1, financialYear: 1, billSequence: 1 } }).toArray();
  const groups = new Map();
  for (const bill of bills) {
    const series = seriesOf(bill);
    const id = `${bill.restaurantId}|${bill.branchId}|${series}`;
    if (!groups.has(id)) groups.set(id, { restaurantId: bill.restaurantId, branchId: bill.branchId, series, sequences: [] });
    groups.get(id).sequences.push(bill.billSequence);
  }
  for (const group of groups.values()) {
    const sorted = group.sequences.sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] === sorted[index - 1]) problems.push(`Bill ${numberInSeries(group.series, sorted[index])} appears twice.`);
      for (let missing = sorted[index - 1] + 1; missing < sorted[index]; missing += 1) problems.push(`Bill ${numberInSeries(group.series, missing)} is missing from series ${group.series}.`);
    }
    const highest = sorted.at(-1);
    const scope = FINANCIAL_YEAR.test(group.series) ? group.series : `PREFIX:${group.series}`;
    const counter = await Counter.collection.findOne({ restaurantId: group.restaurantId, branchId: group.branchId, name: 'BILL', scope });
    if (!counter || counter.value < highest) {
      problems.push(`The counter for series ${group.series} is at ${counter?.value ?? 'nothing'}, behind bill ${numberInSeries(group.series, highest)}: the next bill would reuse a number.`);
    }
  }
  return problems;
}

/** C12 for each restaurant's last 7 closed days. */
export async function checkClosedDays() {
  const problems = [];
  const closures = await DayClosure.collection.find({ status: DAY_STATUSES.CLOSED }).sort({ businessDate: -1 }).toArray();
  const byTenant = new Map();
  for (const closure of closures) {
    const id = `${closure.restaurantId}|${closure.branchId}`;
    const list = byTenant.get(id) ?? [];
    if (list.length < 7) list.push(closure);
    byTenant.set(id, list);
  }
  for (const list of byTenant.values()) {
    const req = { restaurantId: String(list[0].restaurantId), branchId: String(list[0].branchId) };
    const comparisons = [];
    for (const closure of list) comparisons.push({ closure, now: await computeDayFigures(req, closure.businessDate) });
    const result = checkC12(comparisons);
    if (!result.passed) problems.push(result.message);
  }
  return problems;
}

/** All three. Gives back { ok, sections: [{ name, problems }] }. */
export async function verifyDatabase({ expected = null } = {}) {
  const sections = [
    { name: 'Counts', problems: expected ? await checkCounts(expected) : ['No expected counts were given: restore first, or pass --expect.'] },
    { name: 'Invoice series', problems: await checkInvoiceSeries() },
    { name: 'Closed days (C12)', problems: await checkClosedDays() },
  ];
  return { ok: sections.every((section) => section.problems.length === 0), sections };
}
