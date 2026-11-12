# P66 Part payment, Edit bill, and Price includes GST

Model: Opus, high. Owner: Rishi (M3, M10). Depends on: P57, P59, the part
payment panel of 2026-11-01.

Asked for by Rishi on 2026-11-12: "part payment is some payment through UPI and
other cash, the mode can be anything, add a button of the part payment"; "the
manager can edit bill and mode of payment ... after the bill is recorded"; "tick
and untick the GST". His answers to four questions the same day:

1. Part payment is a split screen: rows of method and amount, the last row
   filled with what is left, recorded together.
2. A manager edits a paid bill from one Edit bill button: the payment modes and
   split, the discount, adding items and cancelling an item.
3. GST: **Price includes GST**, per bill. Told first that a GST-registered
   restaurant owes GST on every sale whatever the bill shows, so a bill with GST
   simply taken off is not built. With the tick, the guest pays the menu price
   and the GST is worked out inside it; the bill stays a tax invoice and every
   report shows the real GST.
4. Released to the cafe PC and the live website.

## 1. Part payment (split)

`POST /bills/:billId/payments/split`, the same people as `POST /bills/:billId/payments`.
Two to six rows `{ method, amountInPaise, reference }`, each method once, adding
up to no more than the outstanding. Every row is recorded by `recordPayment`'s
own rules, in order, in one transaction: all of them or none. Cash rows are the
exact amount (no notes counted). A method on the card machine is still sent to
the machine on its own, so with `requireTerminalForLinkedMethods` on it is
refused here as `TERMINAL_REQUIRED`.

Screen: **Part payment** on the payment panel opens the split. Two rows to start
(the first method picked, then the next), **+ Add another method** up to six,
each row's ✕ to remove it, the last row shows "(rest)" and fills itself with what
is left until it is typed. Other asks its mode on the row. Total and Left are
shown; **Record part payment** is on only when every row has an amount and Other
rows a mode.

## 2. Edit bill

On a live bill with payments (Paid, part paid or On Hold), owner and manager see
**Edit bill**, which opens: Change payments, Change discount or GST, Add items,
Cancel an item. Add items and Cancel an item are the P25 and P26 flows unchanged.
For a manager they move behind Edit bill; a cashier or captain keeps them as
before.

### 2a. Change payments

`POST /bills/:billId/payments/change` `{ payments: [1 to 6 rows], reason }`,
owner and manager. The new rows replace the bill's payments and add up exactly to
what was paid, so the bill's status never moves. Refused (422):

- a payment taken on the card machine or Paid online: that money moved through a
  machine or the gateway and stays as it was;
- a platform payment, or a new platform row, inside a live payout for that method;
- payments on different business dates.

The bill's day, the payments' day and today must be open (409 `DAY_CLOSED`).
The new payments keep the old ones' business date and first received time and
person; the notes counted are not kept. What was there before is kept in
`bills.paymentChanges`, with who, when and why, and audited `PAYMENTS_CHANGED`
(owner only). Tally and the CA pack read closed days, so nothing already sent
changes.

### 2b. Change discount or GST

`POST /bills/:billId/reprice` `{ discount, pricesIncludeGst, reason, preview }`,
owner and manager. `discount` is a discount (the same body as 14.4), `null` to
take it off, or left out to keep it; `pricesIncludeGst` left out keeps it. At
least one of the two. An invoice is never edited, so in one transaction, exactly
as P25 Part E: the bill is voided (`DISCOUNT_CHANGED`, marked voided to change
items, so it is in no void list), the order's `pricesIncludeGst` set, a new bill
made with the new discount, and the payments carried: cash over the new total is
handed back, other money over it is a refund owed, an On Hold bill's rest is
charged to the same account, and a bigger total is collected as usual.
`preview: true` answers the new total and what is handed back, and writes
nothing. Platform delivery bills are refused. Audited `BILL_REPRICED`.

## 3. Price includes GST

`POST /bills` takes `pricesIncludeGst` (owner and manager; anyone else 403 when
true). It is set on the order in the bill's transaction, so every later revision,
cancel after billing, re-bill and reprice keeps it. With it on, `toBillLine`
takes each line's price, add-ons included, as including GST:
`exclusiveOfGst(unit, rate)` in `utils/tax.js` (half away from zero) is the bill
line's unit price, the line total is that times the quantity, and the menu price
is kept on the line as `menuUnitPriceInPaise`. Then `computeBillTotals` runs as
always, so item total, discount, net sales, GST, round-off and the line shares
obey every identity in GLOSSARY section 2, and the bill total lands within the
round-off of the menu total (₹100 at 5%: net sales ₹95.24, GST ₹4.76, bill total
₹100.00). A discount comes off the pre-tax item total as always. A bill made with
it is audited `GST_INCLUDED_IN_PRICE`.

Screen: the Bill box (P57) has **Price includes GST** for owner and manager; the
preview shows its totals. A bill made with it says "Prices include GST" under its
totals. Change discount or GST has the same tick.

Off, nothing changes: the golden day and every test stay as they are.

## 4. Done when

1. A split of UPI ₹400 and Cash ₹395 pays a ₹795 bill in one request; a split
   with a bad row records nothing.
2. A paid ₹795 cash bill becomes UPI ₹400 + Cash ₹395 by Change payments; the
   day's cash falls by ₹400 and UPI rises by ₹400; the old payments are in
   `paymentChanges`; a card-machine payment, a closed day, a total that differs
   and a cashier are refused.
3. A paid bill's discount changed by reprice gives a new bill, the old one off
   the void lists, and the cash to hand back; preview writes nothing.
4. Price includes GST on ₹100 at 5% bills ₹100.00 with net sales ₹95.24 and GST
   ₹4.76, line shares balancing; a cashier is refused; off, the golden day holds.
5. Browser: a cashier records UPI ₹400 + Cash ₹395 with Part payment; a manager
   changes a paid bill's payments from Edit bill.
