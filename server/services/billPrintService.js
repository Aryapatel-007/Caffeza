/**
 * Printing a bill at the counter. P25 Part D, API-CONTRACT M3 section 16.3.
 *
 * A captain's phone usually has no printer, so the captain asks, and the
 * counter computer prints. The queue is a read of `bills`, not a collection of
 * its own: a bill is in it while its latest request is newer than its latest
 * print, so it can never be in it twice, and asking again after a print puts
 * it back.
 */
import { Bill } from '../models/Bill.js';
import { User } from '../models/User.js';
import { BusinessRuleError } from '../utils/errors.js';
import { scoped } from '../utils/scopedQuery.js';
import { nowUtc } from '../utils/time.js';
import { readBill } from './billService.js';

const QUEUE_LIMIT = 50;

/** POST /bills/:billId/print-request. Every role that can read the bill. */
export async function requestPrint(req, billId) {
  const bill = await readBill(req, billId);
  if (bill.isVoided) throw new BusinessRuleError('This bill is voided, so it cannot be printed at the counter.');
  bill.printRequestedAt = nowUtc();
  bill.printRequestedBy = req.user.id;
  await bill.save();
  return bill;
}

/** GET /bills/print-queue. The bills waiting for the counter, oldest request first. */
export async function printQueue(req) {
  const bills = await Bill.find({
    ...scoped(req),
    isVoided: false,
    printRequestedAt: { $type: 'date' },
    $expr: { $or: [{ $eq: ['$lastPrintedAt', null] }, { $gt: ['$printRequestedAt', '$lastPrintedAt'] }] },
  })
    .select('billNumber tableName printRequestedAt printRequestedBy printCount')
    .sort({ printRequestedAt: 1 })
    .limit(QUEUE_LIMIT)
    .lean();

  const askers = await User.find({ restaurantId: req.restaurantId, _id: { $in: bills.map((bill) => bill.printRequestedBy) } })
    .select('name')
    .lean();
  const names = new Map(askers.map((user) => [String(user._id), user.name]));

  return bills.map((bill) => ({
    id: String(bill._id),
    billNumber: bill.billNumber,
    tableName: bill.tableName ?? null,
    printRequestedAt: bill.printRequestedAt,
    printRequestedByName: names.get(String(bill.printRequestedBy)) ?? null,
    printCount: bill.printCount ?? 0,
  }));
}

/** POST /bills/:billId/printed. Every print, from any device, records itself here. */
export async function markPrinted(req, billId) {
  await readBill(req, billId);
  const updated = await Bill.findOneAndUpdate(
    { ...scoped(req), _id: billId },
    { $inc: { printCount: 1 }, $set: { lastPrintedAt: nowUtc() } },
    { new: true },
  ).select('printCount');
  return { printCount: updated.printCount, isDuplicate: updated.printCount >= 2 };
}

export default { markPrinted, printQueue, requestPrint };
