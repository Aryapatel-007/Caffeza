# P39 A captain cannot change a printed bill

**Asked for by:** Rishi, 2026-10-12: "make sure that captain which means waiter can add and remove items but after its bill printed he cant do it".
**Modules:** M3 (billing), M2 (orders). Server rule plus the screens that offer the buttons.
**Depends on:** P25 (captains bill), P26 (add after billing), P29 (bill revisions).

## The rule

A captain (role `WAITER`) may add and remove items on an order, and on its bill while the bill has never been printed, exactly as today, with the same manager's PIN where the approval settings already ask for one.

Once the bill has been printed (`printCount` above 0), a captain cannot change its items at all, with or without a manager's PIN. The four ways are refused with 403 `FORBIDDEN`, "This bill has been printed. Only the counter or a manager can change it now.":

1. removing an item from an unpaid bill (`POST /bills/:billId/remove-lines`, a preview included);
2. adding dishes to an order whose bill is revised by them (`POST /orders/:orderId/lines`);
3. cancelling an item after billing (`POST /bills/:billId/cancel-lines`, a preview included);
4. reopening a bill to add items (`POST /bills/:billId/reopen`).

The counter (`OWNER`, `MANAGER`, `CASHIER`) keeps every right it has, and its approvals.

A fixed rule, not a setting: the owner asked for it as the way the restaurant works. It can become a `billing` switch later if a restaurant wants captains to keep changing printed bills.

## Screens

On a printed bill a captain sees no Remove, Add to this bill, Add items or Cancel an item, and reads the same sentence instead. On the order screen a captain gets no "Add more dishes" for an order whose bill has printed.

## Tests

A captain removes and adds on an unprinted bill; after it prints, each of the four is 403 with the sentence, a manager's PIN does not help, and a cashier with the PIN still removes. Breaking the rule on purpose fails the test.
