/**
 * The fixed words that may carry a second-language line. P20A,
 * DESIGN-SYSTEM-V2 section 5d. English here; Gujarati in `gu.js`, Hindi in
 * `hi.js`, keyed the same. Replaces version 1's two per-module copies, the
 * billing screen's Gujarati and the clock screen's Hindi.
 *
 * Action words and state words only. Never item names, never anything a person
 * typed, never a whole-app translation. A word missing from a language file
 * simply shows no second line.
 *
 * The Gujarati billing words and the Hindi clock words are carried over from
 * version 1. Every other translation was added in P20A and should be read by
 * one of Caffeza's staff before go-live.
 */
export const LABELS = Object.freeze({
  // The till.
  billThisOrder: 'Bill this order',
  openBill: 'Open bill',
  discount: 'Discount',
  applyDiscount: 'Apply discount',
  amountReceived: 'Amount received',
  recordPayment: 'Record payment',
  voidBill: 'Void bill',
  printReceipt: 'Print bill',
  reason: 'Reason',
  total: 'Total',
  outstanding: 'Outstanding',
  keepIt: 'Keep it',
  cancel: 'Cancel',
  pay: 'Pay',
  sendToKitchen: 'Send to kitchen',
  done: 'Done',

  // Payment methods, shown only when the method still has its built-in name.
  methodCash: 'Cash',
  methodUpi: 'UPI',
  methodCard: 'Card',
  methodOther: 'Other',

  // States, DESIGN-SYSTEM-V2 section 4b.
  stateFree: 'Free',
  stateOpen: 'Open',
  stateServed: 'Served',
  stateBill: 'Bill printed',
  stateLate: 'Late',
  stateReady: 'Ready',
  stateAvailable: 'Available',
  stateOutOfStock: 'Out of stock',
  statusUnpaid: 'Unpaid',
  statusPaid: 'Paid',
  statusVoided: 'Voided',
  statusOnAccount: 'On Hold',

  // The clock screen.
  clockTitle: 'Clock in / out',
  clockPickName: 'Tap your name',
  clockEnterPin: 'Enter your PIN',
  clockedIn: "You're clocked in",
  clockedOut: "You're clocked out",
  clockSince: 'Since',
  clockWorked: 'Worked',
  clockUndo: 'Undo',
  clockWrongPin: 'Wrong PIN. Try again.',
  clockPinLocked: 'PIN locked. Ask a manager.',
  back: 'Back',
  clear: 'Clear',
  stateIn: 'In',
  stateOut: 'Out',
});

/** Payment method code to its label key. */
export const METHOD_KEYS = Object.freeze({ CASH: 'methodCash', UPI: 'methodUpi', CARD: 'methodCard', OTHER: 'methodOther' });
