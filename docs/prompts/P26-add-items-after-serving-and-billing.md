# P26. Adding items after serving and after billing

Model: Opus, high. Owner: Rishi. Depends on: P25 (Part E's cancel after billing).

## Why

Z Chaat's manager asked for it. A table that has been served orders one more
chaat, or orders more after its bill is printed or paid. Today the server
refuses both: once every dish is served the order is waiting to be billed and
takes no new dish, a bill cannot be changed, and the table is still taken, so
staff can only ring the dish up as a separate takeaway.

## What to build

1. **A served table orders more.** `POST /orders/:orderId/lines` also accepts
   an order that is `READY_TO_BILL` and has no live bill. Adding moves it back
   to `OPEN` and clears `readyToBillAt`. The new dishes go to the kitchen as
   usual, and once they are served the order is ready to bill again.
2. **A billed table orders more.** `POST /bills/:billId/reopen` voids the bill
   and leaves the order waiting to be billed, so dishes can be added to it on
   the normal order screen. The order remembers the voided bill in
   `reopenedFromBillId`. Paid or not paid, On Hold or not.
3. **Money already paid carries over.** When a reopened order is billed again,
   the voided bill's discount and payments move onto the new bill, in Part E's
   order (platform, then card and UPI, then paid online, then cash). Any part
   not needed, when items were also cancelled in between, is cash to give back
   or a refund owed, exactly as Part E. An On Hold bill's unpaid rest is
   charged to the same account again.
4. **Who may.** The same rule as cancelling after billing: an owner or manager
   directly; a cashier, or a captain when captains may bill, with an owner's or
   manager's PIN on the same screen. Platform orders change through the
   platform and are refused. A closed day is refused. A table taken by another
   order since is refused with `TABLE_OCCUPIED`.
5. **Audit.** `BILL_REOPENED`, entity `BILL`, on the voided bill, owner only to
   read, with the approver. The new bill's number is in its own creation; the
   carried payments name the voided bill in `carriedFromBillId`.
6. **Screens.** On a served table's order screen, "Add more dishes" opens the
   menu. On the bill screen, "Add items" asks for the approval, voids the bill
   and opens the order. The new bill, once made, shows "Paid" or what is still
   to collect, and says how much was carried from the old bill.

## Tests

1. Served table: add a dish, the order is OPEN again, the new dish fires,
   serves, and the order bills with every line.
2. Paid bill reopened, a dish added, served, billed again: the new bill's total
   is the old plus the dish, the cash already paid is carried, and the rest is
   due. C1 to C4 pass on the day.
3. Unpaid bill reopened, nothing added, billed again: the same total, nothing
   carried, no refund.
4. A cashier without a PIN is refused; with a manager's PIN, allowed. A captain
   only when captains may bill. A platform order and a closed day are refused.
5. Reopened, then an item cancelled so the new total is smaller than paid:
   the cash over is to give back.
6. A browser test: a paid table orders one more dish through the screens.
