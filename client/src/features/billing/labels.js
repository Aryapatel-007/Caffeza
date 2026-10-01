/**
 * The billing screen's action words, in English and Gujarati.
 *
 * Section 8 of the M3 build brief asked for this to be considered and logged
 * either way; the decision is in docs/PROJECT-STATE.md's decision log. English
 * is primary and set larger; Gujarati sits below in a quieter weight, the same
 * shape as M5's clock screen (decision D6), reused rather than reinvented, but
 * for a different language: this product serves Ahmedabad, and Gujarati is the
 * language spoken there, not Hindi.
 *
 * A handful of fixed action words only — the buttons and states a cashier taps
 * every single bill. Item names, reasons, and anything else that is real prose
 * typed by a person are not translated: this is not a general i18n layer, the
 * same restraint M5 applied. Do not import this file outside features/billing/.
 */
export const BILL_LABELS = {
  billThisOrder: { en: 'Bill this order', gu: 'ઓર્ડરનું બિલ બનાવો' },
  openBill: { en: 'Open bill', gu: 'બિલ ખોલો' },
  discount: { en: 'Discount', gu: 'છૂટ' },
  applyDiscount: { en: 'Apply discount', gu: 'છૂટ આપો' },
  amountReceived: { en: 'Amount received', gu: 'મળેલી રકમ' },
  recordPayment: { en: 'Record payment', gu: 'ચુકવણી નોંધો' },
  voidBill: { en: 'Void bill', gu: 'બિલ રદ કરો' },
  printReceipt: { en: 'Print bill', gu: 'બિલ છાપો' },
  reason: { en: 'Reason', gu: 'કારણ' },
  total: { en: 'Total', gu: 'કુલ' },
  outstanding: { en: 'Outstanding', gu: 'બાકી રકમ' },
  keepIt: { en: 'Keep it', gu: 'રહેવા દો' },
  cancel: { en: 'Cancel', gu: 'રદ કરો' },
};

/** Payment method tiles. */
export const METHOD_LABELS = {
  CASH: { en: 'Cash', gu: 'રોકડ' },
  UPI: { en: 'UPI', gu: 'યુપીઆઈ' },
  CARD: { en: 'Card', gu: 'કાર્ડ' },
  OTHER: { en: 'Other', gu: 'અન્ય' },
};

/** The three states a bill can be in, read on BillStatusBadge. */
export const STATUS_LABELS = {
  UNPAID: { en: 'Unpaid', gu: 'બાકી' },
  PAID: { en: 'Paid', gu: 'ચૂકવેલ' },
  VOIDED: { en: 'Voided', gu: 'રદ' },
  // P09. Charged to an account, collected later.
  ON_ACCOUNT: { en: 'On Hold', gu: 'ખાતે' },
};
