/**
 * What a closed business day becomes in Tally. P25 Part J, API-CONTRACT M21
 * section 9.
 *
 * `vouchersFromRecords` is pure: it takes the day's frozen records and the
 * ledger mapping and returns plain vouchers, so a test can feed it a thousand
 * random days. Every figure is read from values frozen when the event
 * happened, the same way R9 reads them, through splitBillAcrossPayments.
 *
 *   Sales: credits are sales by GST rate, sales where the platform pays the
 *   GST, CGST, SGST and round-off; debits are each payment method's share and
 *   each On Hold charge. One voucher for the day, or one per bill.
 *   Receipt: each On Hold collection: the method, against the account.
 *   Payment: each cash paid out against Cash; a paid in the other way round.
 *   P29 Part F: an expense goes to its category's ledger (or the paid-out
 *   one), a top-up by its source (or the paid-in one); cash taken out to the
 *   bank, during the day or at close, is a contra entry, the bank against Cash,
 *   never an expense; cash given to the owner is the owner's drawings.
 *   Payout, only when asked: the bank and the commission against the
 *   platform's receivable for the gross the payout covers.
 *
 * Voided bills and No Charge orders are never here: neither is a sale. Every
 * voucher balances to the paisa, or nothing is built.
 */
import { splitBillAcrossPayments } from '../../../utils/tax.js';

export const SIDES = Object.freeze({ DEBIT: 'DEBIT', CREDIT: 'CREDIT' });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 Sep 2026", for narrations and the redo confirmation. */
export function dateWords(businessDate) {
  const [year, month, day] = businessDate.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The ledger name for each head, or a note of what is missing. */
class Heads {
  constructor(ledgers = {}) {
    this.ledgers = ledgers;
    this.missing = new Set();
  }

  pick(value, head) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    this.missing.add(head);
    return null;
  }

  salesAt(rateBps) {
    return this.pick(this.ledgers.salesByRate?.[String(rateBps)], `Sales at ${rateBps / 100}%`);
  }

  platformSales() {
    return this.pick(this.ledgers.platformSales, 'Sales where the platform pays GST');
  }

  cgst() {
    return this.pick(this.ledgers.cgst, 'CGST output');
  }

  sgst() {
    return this.pick(this.ledgers.sgst, 'SGST output');
  }

  roundOff() {
    return this.pick(this.ledgers.roundOff, 'Round-off');
  }

  method(code, name) {
    return this.pick(this.ledgers.paymentMethods?.[code], `Payment method ${name ?? code}`);
  }

  onHold(accountId, accountName) {
    const onHold = this.ledgers.onHold ?? {};
    if (onHold.mode === 'PER_ACCOUNT') return this.pick(onHold.byAccount?.[String(accountId)], `On Hold account ${accountName ?? accountId}`);
    return this.pick(onHold.ledger, 'On Hold');
  }

  paidOut() {
    return this.pick(this.ledgers.paidOut, 'Cash paid out');
  }

  paidIn() {
    return this.pick(this.ledgers.paidIn, 'Cash paid in');
  }

  /** P29 Part F. An expense's category ledger, or the paid-out ledger when the category has none. */
  expense(category) {
    const own = category ? this.ledgers.expenseByCategory?.[category] : null;
    return typeof own === 'string' && own.trim() ? own.trim() : this.paidOut();
  }

  /** P29 Part F. A top-up's source ledger, or the paid-in ledger. */
  topUp(source) {
    const own = source ? this.ledgers.topUpBySource?.[source] : null;
    return typeof own === 'string' && own.trim() ? own.trim() : this.paidIn();
  }

  /** P29 Part F. Cash given to the owner. A new head. */
  ownerDrawings() {
    return this.pick(this.ledgers.ownerDrawings, "Owner's drawings");
  }

  /** P29 Part F. Cash taken out for something else. A new head. */
  cashTakenOutOther() {
    return this.pick(this.ledgers.cashTakenOutOther, 'Cash taken out, other');
  }

  bank() {
    return this.pick(this.ledgers.bank, 'Bank');
  }

  commission(code, name) {
    return this.pick(this.ledgers.commissionByMethod?.[code], `Commission for ${name ?? code}`);
  }
}

/** Adds an amount to a ledger on one side, merging lines for the same ledger and side. */
function add(entries, ledger, side, amountInPaise) {
  if (!ledger || !amountInPaise) return;
  const found = entries.find((entry) => entry.ledger === ledger && entry.side === side);
  if (found) found.amountInPaise += amountInPaise;
  else entries.push({ ledger, side, amountInPaise });
}

/** Round-off adds to the bill when positive (a credit) and takes away when negative (a debit). */
function addRoundOff(entries, heads, roundOffInPaise) {
  if (roundOffInPaise > 0) add(entries, heads.roundOff(), SIDES.CREDIT, roundOffInPaise);
  if (roundOffInPaise < 0) add(entries, heads.roundOff(), SIDES.DEBIT, -roundOffInPaise);
}

function salesEntries(bills, heads) {
  const entries = [];
  for (const bill of bills) {
    const platform = bill.taxTreatment === 'PLATFORM_COLLECTS';
    for (const slab of bill.taxBreakdown) {
      add(entries, platform ? heads.platformSales() : heads.salesAt(slab.taxRateBps), SIDES.CREDIT, slab.taxableInPaise);
      add(entries, heads.cgst(), SIDES.CREDIT, slab.cgstInPaise);
      add(entries, heads.sgst(), SIDES.CREDIT, slab.sgstInPaise);
    }
    for (const part of splitBillAcrossPayments(bill)) {
      if (part.kind === 'PAYMENT') add(entries, heads.method(part.method, part.methodName), SIDES.DEBIT, part.amountInPaise);
      else if (part.kind === 'ON_HOLD') add(entries, heads.onHold(bill.account?.accountId, bill.account?.accountName), SIDES.DEBIT, part.amountInPaise);
      else heads.missing.add(`Bill ${bill.billNumber} is not paid`);
    }
  }
  // One round-off line for the voucher, netted across its bills: the day's 0.11, not 1.87 and 1.76.
  addRoundOff(entries, heads, bills.reduce((total, bill) => total + bill.roundOffInPaise, 0));
  // Credits first, then debits, each in the order met: the same order every time.
  return [...entries.filter((entry) => entry.side === SIDES.CREDIT), ...entries.filter((entry) => entry.side === SIDES.DEBIT)];
}

/** The sum of one side, in paise. */
export const sideTotal = (voucher, side) => voucher.entries.filter((entry) => entry.side === side).reduce((total, entry) => total + entry.amountInPaise, 0);

/**
 * Plain vouchers for one closed business date. `records` are the day's frozen
 * `bills` (live only), `collections`, `cashMovements` (live only) and
 * `payouts` (with `grossInPaise`, the covered payments added up). Returns `{ vouchers, missing }`;
 * `missing` lists every head with an amount and no ledger.
 */
export function vouchersFromRecords(records, { businessDate, ledgers, voucherTypes, granularity = 'DAILY_SUMMARY', exportPayouts = false, batchId = '' }) {
  const heads = new Heads(ledgers);
  const narration = (text) => `${text}. ERP export ${dateWords(businessDate)}, batch ${batchId}`;
  const vouchers = [];
  const bills = (records.bills ?? []).filter((bill) => !bill.isVoided);

  if (granularity === 'PER_BILL') {
    for (const bill of bills) {
      vouchers.push({ kind: 'SALES', voucherTypeName: voucherTypes.sales, date: businessDate, number: bill.billNumber, narration: narration(`Bill ${bill.billNumber}`), entries: salesEntries([bill], heads) });
    }
  } else if (bills.length > 0) {
    vouchers.push({ kind: 'SALES', voucherTypeName: voucherTypes.sales, date: businessDate, number: `ERP-${businessDate}-S`, narration: narration(`${bills.length} bills`), entries: salesEntries(bills, heads) });
  }

  (records.collections ?? []).forEach((entry, index) => {
    const entries = [];
    add(entries, heads.method(entry.method, entry.methodName), SIDES.DEBIT, entry.amountInPaise);
    add(entries, heads.onHold(entry.accountId, entry.accountName), SIDES.CREDIT, entry.amountInPaise);
    vouchers.push({ kind: 'RECEIPT', voucherTypeName: voucherTypes.receipt, date: businessDate, number: `ERP-${businessDate}-R${index + 1}`, narration: narration(`Collection from ${entry.accountName ?? 'an account'}`), entries });
  });

  (records.cashMovements ?? [])
    .filter((movement) => !movement.isVoided && (movement.type === 'PAID_OUT' || movement.type === 'PAID_IN'))
    .forEach((movement, index) => {
      const entries = [];
      const cash = heads.method('CASH', 'Cash');
      if (movement.type === 'PAID_OUT') {
        add(entries, heads.expense(movement.category), SIDES.DEBIT, movement.amountInPaise);
        add(entries, cash, SIDES.CREDIT, movement.amountInPaise);
      } else {
        add(entries, cash, SIDES.DEBIT, movement.amountInPaise);
        add(entries, heads.topUp(movement.source), SIDES.CREDIT, movement.amountInPaise);
      }
      const words = movement.reason ?? movement.categoryLabel ?? (movement.type === 'PAID_OUT' ? 'Expense' : 'Top-up');
      vouchers.push({ kind: 'PAYMENT', voucherTypeName: movement.type === 'PAID_OUT' ? voucherTypes.payment : voucherTypes.receipt, date: businessDate, number: `ERP-${businessDate}-P${index + 1}`, narration: narration(words), entries });
    });

  /**
   * P29 Part F. Cash taken out, during the day and at close. To the bank it is
   * a contra entry, never an expense; to the owner, drawings.
   */
  const takenOut = [
    ...(records.cashMovements ?? []).filter((movement) => !movement.isVoided && movement.type === 'CASH_TAKEN_OUT'),
    ...(records.takenOutAtClose?.amountInPaise > 0 ? [{ ...records.takenOutAtClose, atClose: true }] : []),
  ];
  takenOut.forEach((movement, index) => {
    const entries = [];
    const toBank = movement.destination === 'BANK_DEPOSIT';
    const debit = toBank ? heads.bank() : movement.destination === 'OWNER' ? heads.ownerDrawings() : heads.cashTakenOutOther();
    add(entries, debit, SIDES.DEBIT, movement.amountInPaise);
    add(entries, heads.method('CASH', 'Cash'), SIDES.CREDIT, movement.amountInPaise);
    const words = movement.atClose ? (toBank ? 'Cash to the bank at close' : 'Cash taken out at close') : movement.reason ?? (toBank ? 'Cash to the bank' : 'Cash given to the owner');
    vouchers.push({
      kind: toBank ? 'CONTRA' : 'PAYMENT',
      voucherTypeName: toBank ? voucherTypes.contra ?? 'Contra' : voucherTypes.payment,
      date: businessDate,
      number: `ERP-${businessDate}-C${index + 1}`,
      narration: narration(words),
      entries,
    });
  });

  if (exportPayouts) {
    (records.payouts ?? []).forEach((payout, index) => {
      const entries = [];
      // The receivable was debited with the gross on each sale; what the platform kept is its commission.
      const commission = payout.grossInPaise - payout.amountReceivedInPaise;
      add(entries, heads.bank(), SIDES.DEBIT, payout.amountReceivedInPaise);
      if (commission > 0) add(entries, heads.commission(payout.method, payout.methodName), SIDES.DEBIT, commission);
      if (commission < 0) add(entries, heads.commission(payout.method, payout.methodName), SIDES.CREDIT, -commission);
      add(entries, heads.method(payout.method, payout.methodName), SIDES.CREDIT, payout.grossInPaise);
      vouchers.push({ kind: 'PAYOUT', voucherTypeName: voucherTypes.receipt, date: businessDate, number: `ERP-${businessDate}-T${index + 1}`, narration: narration(`${payout.methodName} payout ${payout.periodFrom} to ${payout.periodTo}`), entries });
    });
  }

  return { vouchers, missing: [...heads.missing] };
}

/** Every voucher balances to the paisa, or this names the first that does not. */
export function unbalanced(vouchers) {
  for (const voucher of vouchers) {
    const difference = sideTotal(voucher, SIDES.DEBIT) - sideTotal(voucher, SIDES.CREDIT);
    if (difference !== 0) return { number: voucher.number, differenceInPaise: difference };
  }
  return null;
}

export default { SIDES, dateWords, sideTotal, unbalanced, vouchersFromRecords };
