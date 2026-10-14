# P40 A manager's PIN to add to a printed bill

**Asked for by:** Rishi, 2026-10-13: "captain can remove the items add items before the bill is printed; once the bill is printed then ask for a pin and only cashier can add the items or delete items".
**Modules:** M3 (billing), M2 (orders). Server rule plus the order screen.
**Depends on:** P29 (bill revisions), P39 (a captain cannot change a printed bill).

## Where it stood

Before the bill is printed, a captain adds and removes items freely (P29), and after it a captain cannot (P39). At the counter, removing an item from a printed bill already needs a manager's PIN (`approvals.revisePrintedBill`, P29), as do cancelling after payment and reopening a bill (P25, P26). Adding dishes to a printed, unpaid bill did not: a cashier could raise a bill the guest had already been shown with no one's approval.

## The rule

Adding dishes to an order whose live bill has been printed (`printCount` above 0), which revises that bill (M3 16.8.2), needs a manager's PIN when the caller is a `CASHIER` and `approvals.revisePrintedBill` is on. The same switch as removing, so one setting covers changing a printed bill either way. An `OWNER` or `MANAGER` approves their own, as everywhere since P28. A captain is still refused before any PIN is read (P39).

`POST /orders/:orderId/lines` takes an optional `approval`, the P28 shape. It is read only when the lines would revise a printed bill. The revision stores `approvedBy`, and `BILL_REVISED` names the approver, as a removal does.

Before the first print nothing changes, for anyone.

## Screens

On the order screen of a printed bill, a cashier's first dish asks "A manager approves" in the dish's options sheet. Once a dish has gone on with the PIN, the approval is kept in the screen's memory, never stored on the device, and the next dishes in the same visit go straight on. Leaving the screen forgets it. A refused PIN forgets it too, and the next dish asks again.

The Approvals setting reads "Changing a printed bill needs a manager's PIN", and its help says removing or adding.

## Tests

A cashier adding to a printed bill without a PIN is 403 and the bill is unchanged; with the PIN it is revised and the revision names the manager; a manager adds without one; before printing a cashier adds without one; with the switch off a cashier adds without one. Breaking the rule on purpose fails the test.
