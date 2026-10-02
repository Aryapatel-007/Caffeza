/**
 * R13 Tables and Table Time. M19, built in P16. docs/API-CONTRACT.md "M19" R13.
 *
 * Section `tables`: one row per `bills.tableName` frozen on dine-in bills.
 * Turns per day is bills divided by the business dates in the range. Average
 * table time is the R12 rule: whole minutes from `orderOpenedAt` to `paidAt`
 * on PAID dine-in bills, a total divided by a count; an On Hold bill has no
 * payment time and is left out.
 *
 * Section `kitchen`: per `kots.stationName`, the average of whole minutes from
 * the ticket's `firedAt` to each of its lines' `readyAt`. A line is the unit,
 * because lines are marked ready one by one. Section `slowestItems`: the five
 * items with the longest average kitchen time at each station. Tickets are
 * read by `firedAt` inside the range's business days; `stationId` narrows both
 * kitchen sections.
 */
import mongoose from 'mongoose';

import { Bill } from '../../../models/Bill.js';
import { Kot } from '../../../models/Kot.js';
import { sumPaise } from '../../../utils/money.js';
import { checkC5, datesBetween } from '../../reconciliationService.js';
import { LABELS } from '../labels.js';
import { reportQuery } from '../params.js';
import { averageMinutes, instantsFor, MANAGERS, minutesExpr, netSalesExpr, tenantOf, toBills } from './shared.js';

const SLOWEST_PER_STATION = 5;
const NO_STATION = 'No station';

const tableColumns = [
  { key: 'name', label: LABELS.TABLE, type: 'text' },
  { key: 'billCount', label: LABELS.BILLS, type: 'count' },
  { key: 'covers', label: LABELS.COVERS, type: 'count' },
  { key: 'netSalesInPaise', label: LABELS.NET_SALES, type: 'money' },
  { key: 'turnsPerDay', label: LABELS.TURNS_PER_DAY, type: 'decimal2' },
  { key: 'averageTableTime', label: LABELS.AVERAGE_TABLE_TIME, type: 'decimal2' },
];

const kitchenColumns = [
  { key: 'name', label: LABELS.STATION, type: 'text' },
  { key: 'itemsMade', label: LABELS.ITEMS_MADE, type: 'count' },
  { key: 'kitchenTime', label: LABELS.KITCHEN_TIME, type: 'decimal2' },
];

const slowestColumns = [
  { key: 'station', label: LABELS.STATION, type: 'text' },
  { key: 'name', label: LABELS.ITEM, type: 'text' },
  { key: 'itemsMade', label: LABELS.ITEMS_MADE, type: 'count' },
  { key: 'kitchenTime', label: LABELS.KITCHEN_TIME, type: 'decimal2' },
];

/** Bills over business dates, in hundredths, half up. A ratio of counts, not money. */
const turnsPerDay = (bills, days) => (days > 0 ? Math.round((bills * 100) / days) : 0);

function billsByOrderType(baseMatch) {
  return Bill.aggregate([
    { $match: baseMatch },
    { $sort: { billedAt: 1 } },
    {
      $addFields: {
        netSales: netSalesExpr,
        timed: {
          $and: [
            { $eq: ['$status', 'PAID'] },
            { $ne: [{ $ifNull: ['$orderOpenedAt', null] }, null] },
            { $ne: [{ $ifNull: ['$paidAt', null] }, null] },
          ],
        },
      },
    },
    {
      $group: {
        _id: { orderType: '$orderType', table: { $cond: [{ $eq: ['$orderType', 'DINE_IN'] }, { $ifNull: ['$tableName', null] }, null] } },
        billCount: { $sum: 1 },
        covers: { $sum: { $ifNull: ['$guestCount', 0] } },
        netSalesInPaise: { $sum: '$netSales' },
        billTotalInPaise: { $sum: '$grandTotalInPaise' },
        tableMinutes: { $sum: { $cond: ['$timed', minutesExpr('$orderOpenedAt', '$paidAt'), 0] } },
        timedBills: { $sum: { $cond: ['$timed', 1, 0] } },
      },
    },
  ]);
}

async function wholeBillTotal(baseMatch) {
  const [whole] = await Bill.aggregate([{ $match: baseMatch }, { $group: { _id: null, total: { $sum: '$grandTotalInPaise' } } }]);
  return whole?.total ?? 0;
}

/** Every line marked ready on a ticket fired in the range, with its minutes. */
async function kitchenLines(req, baseMatch, params) {
  const { start, end } = await instantsFor(req, params.from, params.to);
  return Kot.aggregate([
    {
      $match: {
        ...tenantOf(baseMatch),
        firedAt: { $gte: start, $lt: end },
        ...(params.stationId ? { stationId: new mongoose.Types.ObjectId(params.stationId) } : {}),
      },
    },
    { $unwind: '$lines' },
    { $match: { 'lines.status': { $ne: 'CANCELLED' }, 'lines.readyAt': { $ne: null } } },
    {
      $group: {
        _id: { station: { $ifNull: ['$stationName', NO_STATION] }, item: '$lines.itemName', variant: { $ifNull: ['$lines.variantName', null] } },
        itemsMade: { $sum: '$lines.quantity' },
        lines: { $sum: 1 },
        minutes: { $sum: minutesExpr('$firedAt', '$lines.readyAt') },
      },
    },
  ]);
}

export default {
  id: 'R13',
  name: 'tables',
  title: 'Tables and Table Time',
  roles: MANAGERS,
  schema: reportQuery(['stationId']),
  filters: ['stationId'],
  dimensions: [],
  columns: tableColumns,

  async query(req, baseMatch, params) {
    const [groups, whole, kitchen] = await Promise.all([
      billsByOrderType(baseMatch),
      wholeBillTotal(baseMatch),
      kitchenLines(req, baseMatch, params),
    ]);
    const days = datesBetween(params.from, params.to).length;
    const range = { from: params.from, to: params.to };

    const dineIn = groups.filter((group) => group._id.orderType === 'DINE_IN');
    const tableRows = dineIn
      .map((group) => ({
        name: group._id.table ?? 'No table',
        billCount: group.billCount,
        covers: group.covers,
        netSalesInPaise: group.netSalesInPaise,
        turnsPerDay: turnsPerDay(group.billCount, days),
        averageTableTime: averageMinutes(group.tableMinutes, group.timedBills),
        ...(group._id.table
          ? { drill: { billCount: toBills({ ...range, orderType: 'DINE_IN', table: group._id.table }), netSalesInPaise: toBills({ ...range, orderType: 'DINE_IN', table: group._id.table }) } }
          : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const sum = (field) => sumPaise(0, ...dineIn.map((group) => group[field]));
    const tableTotals = {
      billCount: sum('billCount'),
      covers: sum('covers'),
      netSalesInPaise: sum('netSalesInPaise'),
      turnsPerDay: turnsPerDay(sum('billCount'), days),
      averageTableTime: averageMinutes(sum('tableMinutes'), sum('timedBills')),
      drill: { billCount: toBills({ ...range, orderType: 'DINE_IN' }) },
    };

    // Kitchen: stations, then each station's slowest items.
    const stations = new Map();
    for (const group of kitchen) {
      const station = stations.get(group._id.station) ?? { name: group._id.station, itemsMade: 0, lines: 0, minutes: 0, items: [] };
      station.itemsMade += group.itemsMade;
      station.lines += group.lines;
      station.minutes += group.minutes;
      station.items.push({
        station: group._id.station,
        name: group._id.variant ? `${group._id.item} (${group._id.variant})` : group._id.item,
        itemsMade: group.itemsMade,
        kitchenTime: averageMinutes(group.minutes, group.lines),
      });
      stations.set(group._id.station, station);
    }
    const stationList = [...stations.values()].sort((a, b) => a.name.localeCompare(b.name));
    const kitchenRows = stationList.map((station) => ({
      name: station.name,
      itemsMade: station.itemsMade,
      kitchenTime: averageMinutes(station.minutes, station.lines),
    }));
    const slowestRows = stationList.flatMap((station) =>
      station.items
        .sort((a, b) => b.kitchenTime - a.kitchenTime || a.name.localeCompare(b.name))
        .slice(0, SLOWEST_PER_STATION),
    );
    const kitchenTotals = {
      itemsMade: sumPaise(0, ...stationList.map((station) => station.itemsMade)),
      kitchenTime: averageMinutes(
        sumPaise(0, ...stationList.map((station) => station.minutes)),
        sumPaise(0, ...stationList.map((station) => station.lines)),
      ),
    };

    // C5.4: the dine-in tables and the other order types add up to every bill.
    const orderTypeRows = [
      { name: 'DINE_IN', billTotalInPaise: sum('billTotalInPaise') },
      ...groups
        .filter((group) => group._id.orderType !== 'DINE_IN')
        .map((group) => ({ name: group._id.orderType, billTotalInPaise: group.billTotalInPaise })),
    ];

    return {
      sections: [
        { key: 'tables', title: 'Tables', columns: tableColumns, rows: tableRows, totals: tableTotals },
        { key: 'kitchen', title: 'Kitchen time', columns: kitchenColumns, rows: kitchenRows, totals: kitchenTotals },
        { key: 'slowestItems', title: 'Slowest items', columns: slowestColumns, rows: slowestRows, totals: {} },
      ],
      orderTypeRows,
      whole,
    };
  },

  checks(req, params, result) {
    return [checkC5(4, result.orderTypeRows, 'billTotalInPaise', result.whole)];
  },
};
