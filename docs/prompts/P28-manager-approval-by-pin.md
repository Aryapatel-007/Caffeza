# P28. A manager's PIN for cancels, voids and cash

Model: Opus, high. Owner: Rishi. Depends on: P26 (the PIN approval it extends).

## Why

Rishi asked for it on 2026-10-09: cancelling and other sensitive work at Z
Chaat should need a password before it happens. He chose a manager's PIN, typed
on the same screen, which P25 Part E already uses to cancel an item after
billing and P26 uses to reopen a bill.

Three gaps today:

1. A captain or cashier cancels an item the kitchen already has with no one's
   approval.
2. A cashier puts cash into the drawer (paid in) with no one's approval.
3. Nobody at Z Chaat has a PIN, and no screen sets one, so the approvals that
   already exist cannot be given.

He also asked that a cashier may do four manager-only things when a manager
types their PIN: void a bill, cancel a whole order, give No Charge, and take
cash out of the drawer (paid out). And that the owner can switch each approval
on or off.

## What to build

1. **One approval check.** `approverFor` moves from `billCancelLinesService.js`
   to a new `services/approvalService.js`, unchanged in behaviour, and every
   approval below goes through it: an OWNER or MANAGER approves themselves; a
   role the rule lets ask must send `approval: { approverId, pin }` naming an
   active OWNER or MANAGER of the same restaurant, whose PIN `verifyPin`
   checks (five wrong tries lock it). A missing approval is 403 and a wrong
   PIN 401 `INVALID_PIN`, as today. The two P25 and P26 callers use it unchanged.
2. **Settings.** A new group, `settings.approvals`, OWNER to change:
   `lineCancel` (default true), `paidIn` (default true) and `managerTasks`
   (default true). On `GET /auth/me` too, because the till and the captain
   need it and cannot read `GET /settings`.
3. **Cancelling an item the kitchen has.** `POST /orders/:orderId/lines/:lineId/cancel`
   takes `approval`. With `approvals.lineCancel` on, a CASHIER or WAITER
   cancelling a line that is FIRED, READY or SERVED needs it. A line still
   PENDING, never sent, needs none: taking back a mistaken tap is not a
   loss. The line stores `cancelApprovedBy`.
4. **Paid in.** `POST /cash-movements` takes `approval`. With `approvals.paidIn`
   on, a CASHIER's `PAID_IN` needs it. The opening float needs none. The
   movement stores `approvedBy`.
5. **Manager tasks with a PIN.** With `approvals.managerTasks` on, a CASHIER may,
   with `approval`: void a bill (`POST /bills/:billId/void`), cancel a whole
   order (`POST /orders/:orderId/cancel`), give No Charge
   (`POST /orders/:orderId/no-charge`), and record a `PAID_OUT`. With it off,
   these stay OWNER and MANAGER only, as today. A WAITER never may. Who acted
   stays the cashier (`voidedBy`, `cancelledBy`, `by`); the approver is stored
   beside it (`bills.voidApprovedBy`, `orders.cancelApprovedBy`,
   `noCharge.approvedBy`, `cashmovements.approvedBy`). For No Charge,
   `approvedBy` keeps its meaning: the manager who allowed it.
6. **Audit.** Each existing audit line for these actions (`BILL_VOIDED`,
   `ORDER_CANCELLED`, `NO_CHARGE_GIVEN`, `CASH_PAID_OUT`,
   `LINE_CANCELLED_AFTER_PREP`) gains `details.approvedBy` when someone else
   approved. Two new actions, so an approved cancel or paid in is never
   silent: `LINE_CANCELLED_APPROVED` (a line cancelled with an approval and
   not after preparation, which writes its own line) and `CASH_PAID_IN`
   (written only when approved). A MANAGER may see `LINE_CANCELLED_APPROVED`,
   like the other cancels; `CASH_PAID_IN` is OWNER only.
7. **PINs on the Staff screen.** A person's page gets "Set PIN" (4 to 6 digits,
   typed twice), through the existing `PATCH /users/:userId/pin`. A manager
   cannot set an owner's, as today. `GET /users/approvers` gains `hasPin`, so
   the approval step greys out a manager with no PIN and says the owner must
   set one first. The audit reason for `USER_PIN_RESET` becomes "PIN set."
8. **Screens.** One shared approval step, `components/ui/ApprovalStep.jsx`
   (the approver tiles and the PIN keypad), replaces the two copies in
   `CancelItemsPanel` and `AddItemsPanel` and is used on the line cancel,
   whole-order cancel, No Charge, void and cash drawer panels when the rule
   needs it. A cashier now sees Void, Cancel order and No Charge when
   `managerTasks` is on. Settings gets an "Approvals" section with the three
   switches.

## Tests

1. A captain cancels a sent line: refused without approval, refused with a
   wrong PIN, allowed with the manager's PIN; `cancelApprovedBy` is the
   manager and the audit line names them. An unsent line needs none. An
   owner needs none. With `lineCancel` off, none.
2. A cashier's paid in: the same three cases; the opening float needs none.
3. A cashier voids a bill, cancels a whole order and gives No Charge with a
   PIN; refused without; refused with `managerTasks` off; a waiter refused
   either way. Reports R15 and R16 still balance on the golden day.
4. A cashier's paid out with a PIN; refused without.
5. `GET /users/approvers` shows `hasPin`; an approver with no PIN is refused
   like a wrong PIN.
6. The P25 and P26 approval tests pass unchanged.
7. A browser test: a captain cancels a sent dish and the manager types their
   PIN on the captain's phone.
