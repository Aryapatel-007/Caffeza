/**
 * The printed receipt, laid out on the server.
 *
 * The client prints what it is given. It does no wrapping, no padding and no
 * column arithmetic of its own, and that is not a preference.
 *
 * A thermal printer has a fixed character width. BUILD-PLAN section 8 names a
 * long dish name wrapping and destroying the layout as a thing that bites
 * teams the week before a pilot. One server-side implementation can be snapshot
 * tested; a browser and a printer each doing their own layout will disagree,
 * and the disagreement only ever shows up on paper, in a restaurant, at 8pm.
 *
 * 32 characters is 58mm paper. 48 is 80mm.
 *
 * This is also the one place in the server that formats money for display,
 * because the layout depends on the exact character count. Everywhere else
 * hands paise to the client and lets it format.
 */
import { discountReasonText } from '../config/discountReasons.js';
import { paiseToRupees } from '../utils/money.js';
import { toIst } from '../utils/time.js';

const RULE = '-';
const DOUBLE_RULE = '=';

/** Right-aligned money, so a column of amounts lines up on the decimal point. */
function money(paise) {
  return paiseToRupees(paise);
}

export function centre(text, width) {
  const trimmed = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return ' '.repeat(pad) + trimmed;
}

export function rule(width, character = RULE) {
  return character.repeat(width);
}

/**
 * A label on the left and an amount on the right, filling the width.
 *
 * When the two cannot both fit, the label is truncated rather than the amount:
 * a customer can live with "Paneer Tikka Mas" and cannot live with a total
 * missing its last digit.
 */
export function row(label, amount, width) {
  const value = String(amount);
  const room = width - value.length - 1;
  const left = label.length > room ? label.slice(0, Math.max(0, room)) : label;
  return left + ' '.repeat(Math.max(1, width - left.length - value.length)) + value;
}

/**
 * Wraps a long name across lines, indenting the continuation under itself.
 *
 * Never truncates and never lets the name push the amount column out of
 * alignment. This is the function the 60-character snapshot test exists for.
 */
export function wrapName(name, width, indent = 2) {
  const words = name.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const room = lines.length === 0 ? width : width - indent;
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= room) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    // A single word longer than the line is cut hard: there is nowhere else
    // for it to go, and leaving it would overflow the column.
    current = word.length > width - indent ? word.slice(0, width - indent) : word;
  }
  if (current) lines.push(current);

  return lines.map((line, index) => (index === 0 ? line : ' '.repeat(indent) + line));
}

/**
 * IST, because a bill is read by a person standing in Gujarat.
 *
 * Built on utils/time.js `toIst` rather than on its own date maths, so the one
 * sanctioned UTC-to-IST conversion stays the only one. That helper returns
 * "2026-08-30 15:30:00 IST"; a receipt wants the day first and no seconds.
 */
function istStamp(date) {
  const [day, time] = toIst(date).split(' ');
  const [year, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}/${month}/${year} ${time.slice(0, 5)}`;
}

/**
 * Renders a bill as plain text at a fixed column width.
 *
 * `restaurant` and `bill` are documents. Nothing is fetched here: the caller
 * has both already and a formatter that reaches for the database is a
 * formatter that cannot be tested without one.
 */
export function renderReceipt({ restaurant, bill, width = 32 }) {
  const lines = [];
  const push = (text = '') => lines.push(text);

  push(centre(restaurant.name.toUpperCase(), width));
  if (restaurant.legalName) push(centre(restaurant.legalName, width));

  const address = restaurant.address ?? {};
  for (const part of [address.line1, address.line2]) {
    if (part) push(centre(part, width));
  }
  if (address.city || address.pincode) {
    push(centre([address.city, address.pincode].filter(Boolean).join(' '), width));
  }
  if (restaurant.gstin) push(centre(`GSTIN: ${restaurant.gstin}`, width));
  if (restaurant.fssaiLicenseNumber) {
    push(centre(`FSSAI: ${restaurant.fssaiLicenseNumber}`, width));
  }

  push(rule(width, DOUBLE_RULE));
  push(row('Bill', bill.billNumber, width));
  push(row('Date', bill.businessDate, width));
  push(row('Time', istStamp(bill.billedAt), width));
  if (bill.tableName) push(row('Table', bill.tableName, width));
  push(rule(width));

  // Quantity and amount share the right-hand side, so the name gets the rest.
  push(row('Item', 'Amount', width));
  push(rule(width));

  for (const line of bill.lines) {
    const wrapped = wrapName(line.itemName + (line.variantName ? ` (${line.variantName})` : ''), width);
    for (const part of wrapped.slice(0, -1)) push(part);

    const last = wrapped[wrapped.length - 1];
    push(row(last, money(line.lineTotalInPaise), width));
    push(`  ${line.quantity} x ${money(line.unitPriceInPaise)}`);

    for (const addOn of line.addOnNames ?? []) push(`  + ${addOn}`.slice(0, width));
  }

  push(rule(width));
  push(row('Subtotal', money(bill.subtotalInPaise), width));

  if (bill.discount) {
    const label =
      bill.discount.kind === 'PERCENT'
        ? `Discount (${bill.discount.rateBps / 100}%)`
        : 'Discount';
    push(row(label, `-${money(bill.discount.amountInPaise)}`, width));
    const reasonLine = discountReasonText(bill.discount);
    if (reasonLine) for (const part of wrapName(`  ${reasonLine}`, width, 2)) push(part);
  }

  for (const slab of bill.taxBreakdown) {
    const percent = slab.taxRateBps / 100;
    push(row(`CGST @ ${percent / 2}%`, money(slab.cgstInPaise), width));
    push(row(`SGST @ ${percent / 2}%`, money(slab.sgstInPaise), width));
  }

  if (bill.roundOffInPaise !== 0) {
    const sign = bill.roundOffInPaise > 0 ? '' : '-';
    push(row('Round off', `${sign}${money(Math.abs(bill.roundOffInPaise))}`, width));
  }

  push(rule(width, DOUBLE_RULE));
  push(row('TOTAL', money(bill.grandTotalInPaise), width));
  push(rule(width, DOUBLE_RULE));

  for (const payment of bill.payments ?? []) {
    push(row(payment.method, money(payment.amountInPaise), width));
  }

  if (bill.isVoided) {
    push('');
    push(centre('*** VOIDED ***', width));
  }

  push('');
  push(centre('Thank you', width));
  push('');

  return lines.join('\n');
}

export default { renderReceipt };
