/**
 * The day-end message. P44, API-CONTRACT P44.
 *
 * The text Z Chaat's manager sends every night, in their own words (GLOSSARY
 * section 29), built from the same figures as Day Close and R2: the day from
 * readDayView, which is the stored snapshot once the day is closed, and the
 * month's bill total from R3 through the report engine. Nothing is worked out
 * here that those do not already work out, except putting it into words.
 */
import { Bill } from '../models/Bill.js';
import { Restaurant } from '../models/Restaurant.js';
import { Table } from '../models/Table.js';
import { averagePaise, paiseToWholeRupeesText, sumPaise } from '../utils/money.js';
import { scoped } from '../utils/scopedQuery.js';
import { readDayView, seesCash } from './dayCloseService.js';
import { runReport } from './reports/engine.js';
import salesByDay from './reports/definitions/salesByDay.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const OTHER_METHOD = 'OTHER';
const HIDDEN = '—';

const rupees = (paise) => paiseToWholeRupeesText(paise ?? 0);

/** "2026-10-13" as "13-October-2026". */
export function messageDate(businessDate) {
  const [year, month, day] = businessDate.split('-').map(Number);
  return `${day}-${MONTHS[month - 1]}-${year}`;
}

/**
 * P43. The day's Other payments, by the mode typed for each, so the message
 * reads "Other (Zomato dine out)" as the manager's old one did.
 */
async function otherByMode(req, businessDate) {
  const bills = await Bill.find({ ...scoped(req), businessDate, isVoided: false, 'payments.method': OTHER_METHOD }).select('payments').lean();
  const byMode = new Map();
  for (const bill of bills) {
    for (const payment of bill.payments) {
      if (payment.method !== OTHER_METHOD) continue;
      const mode = payment.reference?.trim() || 'Other';
      byMode.set(mode, sumPaise(byMode.get(mode) ?? 0, payment.amountInPaise));
    }
  }
  return [...byMode.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The seats of the active tables that have a seat count. */
async function totalSeats(req) {
  const tables = await Table.find({ ...scoped(req), isActive: true, seats: { $ne: null } }).select('seats').lean();
  return tables.reduce((total, table) => total + (table.seats ?? 0), 0);
}

/** The bill total from the 1st of the month to the date, through the report engine, and the days that covers. */
async function monthToDate(req, businessDate) {
  const from = `${businessDate.slice(0, 8)}01`;
  const { envelope } = await runReport(req, salesByDay, { from, to: businessDate });
  const days = Number(businessDate.slice(8, 10));
  const totalInPaise = envelope.totals?.billTotalInPaise ?? 0;
  return { totalInPaise, days, averageInPaise: averagePaise(totalInPaise, days) };
}

/**
 * The message for one business date. `full`: the cash-in-hand lines with
 * their figures; otherwise they read "—" for a caller who may not see the
 * drawer total. Returns `{ businessDate, subject, text }`.
 */
export async function buildDayEndMessage(req, businessDate, { full = false } = {}) {
  const [view, restaurant, others, seats, month, showCash] = await Promise.all([
    readDayView(req, businessDate),
    Restaurant.findById(req.restaurantId).select('name').lean(),
    otherByMode(req, businessDate),
    totalSeats(req),
    monthToDate(req, businessDate),
    full ? true : seesCash(req),
  ]);
  const { sales, money, cash } = view.figures;
  const name = restaurant?.name ?? 'Restaurant';

  const methodLines = [];
  for (const row of money.methods ?? []) {
    if (row.method === OTHER_METHOD && others.length > 0) {
      for (const [mode, amountInPaise] of others) methodLines.push(`Other (${mode}) - ${rupees(amountInPaise)}`);
      continue;
    }
    methodLines.push(`${row.methodName} - ${rupees(row.amountInPaise)}`);
  }

  // Counted and kept once closed; until then, what the drawer should hold now.
  const inHandInPaise = view.isClosed ? view.countedCashInPaise : (view.expectedCashInPaise ?? cash?.expectedCashInPaise);
  const pettyInPaise = view.isClosed ? (view.keptForTomorrowInPaise ?? view.countedCashInPaise) : inHandInPaise;
  const cashText = (paise) => (showCash && paise !== null && paise !== undefined ? rupees(paise) : HIDDEN);

  const covers = sales.covers ?? 0;
  const occupancy = seats > 0 ? `${covers} pax / ${seats} seats (${Math.round((covers * 100) / seats)}%)` : `${covers} pax`;
  const dueInPaise = sumPaise(money.onHoldInPaise ?? 0, money.unpaidInPaise ?? 0);

  const lines = [
    name,
    messageDate(businessDate),
    '',
    `Gross Sale - ${rupees(sales.billTotalInPaise)}`,
    `Tax - ${rupees(sales.gstInPaise)}`,
    `Net Sale - ${rupees(sales.netSalesInPaise)}`,
    '',
    ...methodLines,
    `Due payment - ${rupees(dueInPaise)}`,
    `Total exp - ${rupees(cash?.paidOutInPaise ?? 0)}`,
    `Today APC - ${rupees(sales.averagePerCoverInPaise)}`,
    `Today Pax - ${covers}`,
    `Grand Total Cash in hand - ${cashText(inHandInPaise)}`,
    `Total Petty Cash - ${cashText(pettyInPaise)}`,
    `Occupancy - ${occupancy}`,
    `Monthly Till Date sale - ${rupees(month.totalInPaise)}`,
    `Daily Average - ${rupees(month.averageInPaise)}`,
  ];

  return {
    businessDate,
    subject: `${name} day end, ${messageDate(businessDate)}`,
    text: lines.join('\n'),
  };
}

export default { buildDayEndMessage, messageDate };
