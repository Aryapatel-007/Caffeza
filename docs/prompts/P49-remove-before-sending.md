# P49 Before a dish is sent, the captain changes it freely

**Asked for by:** Rishi, 2026-10-14: "when the captain is making the order and the guest changes the order and he makes the changes, it should not reflect, because it's not his fault; no need to mention or ask the reason; before sending to the kitchen, let him edit whatever the guest asks, no need to ask for a reason."
**Modules:** M2.
**Depends on:** P04 (cancel reasons), P29 (a billed order changes through its bill).

## The rule

A dish not yet sent to the kitchen (`PENDING`) is a draft. Removing it asks nothing and leaves nothing behind: it is deleted from the order, with no reason, no cancelled line and no report row, as CONVENTIONS section 3 allows for "an unfired draft order line". Its quantity and note were already editable without a reason (12.5).

Once a dish is sent, everything is as before: P41's Undo for a minute, then P42's Change, with a reason and a PIN only for a dish the kitchen made.

## Server

`DELETE /orders/:orderId/lines/:lineId?version=7`. Roles: OWNER, MANAGER, CASHIER, WAITER. The line must be `PENDING` (422 "This dish has been sent to the kitchen. Use Change." otherwise), and the order must have no live bill (422, as 12.5). The line is pulled from the order through the version (409 on a stale one). An order whose last dish is removed stays open, empty. Nothing is audited and no stock moves, because nothing was ever sent.

## Screens

On the order, a not-sent dish has **Remove** (no sheet, no question). On a dish card, the minus at 1 removes the unsent dish the same way.

## Tests

A captain removes an unsent dish: it is gone from the order, no cancelled line, no reason; a sent dish is refused; a billed order is refused; a stale version is 409; another restaurant's order is 404; the kitchen login is refused.
