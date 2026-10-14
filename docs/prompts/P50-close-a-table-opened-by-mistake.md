# P50 Close a table opened by mistake

**Asked for by:** Rishi, 2026-10-14: "the captain opened one table and then he wants to close that table; he can close it because it was opened by mistake."
**Modules:** M2.
**Depends on:** P49 (removing a dish before it is sent).

## The rule

An order nothing has been sent from is a draft, like its dishes in P49. Anyone who takes orders (owner, manager, cashier, captain) may close it, with no reason and no PIN. Its unsent dishes go with it, removed as P49 removes them, and the table is free again.

Orders are never deleted (CLAUDE.md), so the order is kept, marked cancelled with the code `OPENED_BY_MISTAKE`. Because nothing reached the kitchen and nothing was sold, it is left out of R15's cancelled orders and of Day Close's "Orders cancelled", and no audit line is written.

Once anything has been sent to the kitchen, the order is closed only as before: a manager's Cancel order, with a reason, or a cashier with the manager's PIN.

## Server

`POST /orders/:orderId/close` with `{ version }`. Roles: OWNER, MANAGER, CASHIER, WAITER. The order must be `OPEN`, have no bill, and no line may ever have been sent (`firedAt` set, or any status other than `PENDING`); otherwise 422, "Dishes have been sent to the kitchen. Ask a manager to cancel the order." A stale version is 409. `OPENED_BY_MISTAKE` is a code only this endpoint writes; the manager's Cancel order does not accept it.

## Screens

On an open order with nothing sent, **Close table** (dine-in) or **Close order** (takeaway, delivery), for every role that takes orders. A short sheet confirms: "Close Table 3? It was opened by mistake. Nothing has gone to the kitchen." with Close table. Then the floor.

## Tests

A captain opens a table, adds a dish, and closes it: the order is cancelled with `OPENED_BY_MISTAKE` and the dish gone, the table is free, no audit line, and neither R15 nor the day's figures count it. Refused once a dish is sent (even if it was later undone or cancelled), with a bill, on a stale version, from another restaurant, and for the kitchen login. The manager's Cancel order refuses the code.
