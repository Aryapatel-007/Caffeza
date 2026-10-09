# P29 Bill edits without voids, ready means served, print before payment, undo in the kitchen, and a clear cash book

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Repository:** https://github.com/Aryapatel-007/Caffeza
**Depends on:** P28, a manager's PIN for cancels, voids and cash, which is built.
**Size:** medium to large. Seven parts, A to G, each committed and ticked in a progress table, so a later session can carry on from the first unfinished part.

---

## 1. What to build, in one sentence

Let staff remove or add items on a bill that has not been paid without voiding it, make the kitchen's "ready" mean "served", print the bill before asking how it is paid, let the kitchen undo a wrong tick, and replace the cash drawer with one clear cash book that shows yesterday's cash, top-ups, expenses, cash taken out and the cash in the drawer.

## 2. Why, in the owner's words

1. "A bottle is added by mistake, and at the time of the bill it is removed. There is no need for a rebill, and no need for a record in voided bills."
2. "Remove the mark served step. In the kitchen, order ready means served."
3. "First print the bill, then ask the mode of payment."
4. "On the kitchen display, a person can tick the wrong item by mistake. Give an option to undo it."
5. "The cashier part, with the previous day's cash and notes, top-ups, total expenses, what is left after expenses, and total cash, is not easy to use." The owner drew it as: previous plus top-up, minus expenses, gives total cash.

Built for any restaurant. The live client is Z Chaat. Nothing names a restaurant in code.

---

## 3. You are a new session. Do this first

1. **Pull first.** If the repository is not on this machine, `git clone https://github.com/Aryapatel-007/Caffeza.git` and work inside it. If it is, `git checkout main` and `git pull`.
2. `git log --oneline -1` must be `d7369a1` or later. If it is older, stop and tell me.
3. `docs/prompts/README.md` must show P28 as Done. If not, stop.
4. `npm ci` at the root.
5. If there is no `.env`, copy `.env.example` to `.env` and **stop and ask me for the values**. Never guess them, never commit them.
6. If there is no `server/.env.test`, copy `server/.env.test.example` to it.
7. Read `CLAUDE.md` in full. Every rule in it applies.
8. Save this entire prompt, exactly as given, to `docs/prompts/P29-bill-edits-ready-means-served-print-first-kitchen-undo-cash-book.md`.
9. Run `npm test` once and record the count.

The server is now deployed on Render and the screens on Vercel, with `/api` forwarded (commit `d7369a1`). Change nothing about that.

---

## 4. How this prompt runs

When you start Part A, add this table to a P29 entry at the top of "What changed recently" in `docs/PROJECT-STATE.md`:

```
P29 progress
- [ ] A Spec
- [ ] B Change an unpaid bill without voiding it
- [ ] C Ready means served
- [ ] D Print before payment
- [ ] E Undo in the kitchen
- [ ] F The cash book
- [ ] G Full check
```

Tick a line only when that part is committed and pushed.
If this session is running out of room, finish the part you are on, commit, push, tick it, and stop with a summary. A new session given this same prompt starts at the first unticked part.
After each part, run the tests that part touched. Run the whole suite in Part G.

---

## 5. Files to read first

1. `CLAUDE.md`, and through it `docs/PROJECT-STATE.md`, `docs/CONVENTIONS.md`, `docs/GLOSSARY.md`.
2. `docs/prompts/P25-zchaat-cashier-integrations.md` Parts D, E and F, `docs/prompts/P26-*.md`, `docs/prompts/P28-*.md`.
3. `docs/API-CONTRACT.md`: M2 orders, M3 bills (especially sections 16.4 cancel after billing and 16.7 reopen), M16 settlement, M18 kitchen, M8 audit, and the R2, R7, R10, R14 and R15 report entries.
4. `docs/DB-SCHEMA.md`: orders, bills, kots, cash movements, day closures, settings.
5. `docs/RECONCILIATION-RULES.md` and `docs/TEST-DATA.md`.
6. Server: `services/billService.js` (all of it), `billCancelLinesService.js`, `billReopenService.js`, `billCarryService.js`, `billPermissionService.js`, `billPrintService.js`, `lineCancelService.js`, `approvalService.js`, `orderService.js` and its `isReadyToBill`, `kitchenService.js` and its `markKotLinesReady` and `kotStatusOf`, `integrations/platformOrderService.js` and its `notifyFoodReadyIfDone`, `cashService.js`, `dayCloseService.js`, `dayFiguresService.js`, `reconciliationService.js`, `receiptService.js`, and the report definitions `cashTill.js`, `dayClose.js`, `invoiceRegister.js`, `cancellations.js`.
7. Server: `controllers/orderController.js`, especially `markLineServed` and the P26 reopen-on-add path.
8. Server: `models/Order.js`, `Bill.js`, `Kot.js`, `CashMovement.js`, `DayClosure.js`, `Restaurant.js` settings.
9. If P25 Part J exists: `services/integrations/tally/`, for how paid in and paid out become vouchers.
10. Client: `features/billing/BillScreenPage.jsx`, `CancelItemsPanel.jsx`, `AddItemsPanel.jsx`, `InlinePayment.jsx`, `MethodButtons.jsx`; `features/orders/OrderScreenPage.jsx`, `OrderLineList.jsx`; `features/kitchen/KitchenDisplayPage.jsx`; `features/settlement/CashDrawerPage.jsx`, `DayClosePage.jsx`; `features/cash/CashCounter.jsx`; `features/printing/`; `components/ui/ApprovalStep.jsx`.
11. `docs/DESIGN-SYSTEM.md`, for every screen.

---

## Part A. Spec first

Commit before any code, as `spec p29 bill edits ready means served print first kitchen undo cash book`.

1. `docs/API-CONTRACT.md`: every endpoint and rule in Parts B to F, in the sections they belong to.
2. `docs/DB-SCHEMA.md`: every new field and collection, numbered after the last existing section.
3. `docs/CONVENTIONS.md` section 3: new error codes.
4. `docs/GLOSSARY.md`: bill revision, revised bill, top-up, expense, expense category, cash taken out, brought forward, kept for tomorrow, cash check, cash in drawer.
5. New audit actions in the M8 section.
6. `docs/RECONCILIATION-RULES.md`: the changes in B8 and F8.

---

## Part B. Change an unpaid bill without voiding it

### B1. The rule

A bill that **nothing has been paid on yet** is still being agreed with the guest.
Removing an item from it, or adding one, is a **revision of the same bill**: same invoice number, new totals, a revision record. It is **not** a void.

Once any money is recorded on a bill, today's behaviour stays exactly as it is: P25's cancel after billing and P26's reopen void the bill and make a new one, because money has moved.

### B2. When a bill can be revised

All of these must be true. Otherwise the existing void-and-rebill paths apply, and the screen offers them as today.

1. The bill is not voided.
2. Its status is `UNPAID`, `amountPaidInPaise` is 0, no advance is applied, and it is not charged to an account.
3. No terminal payment on it is `WAITING` or `UNKNOWN`.
4. It is not a platform delivery order.
5. Its business date is open.
6. `settings.billing.reviseUnpaidBills` is true. New setting, default `true`, owner only, audited.

### B3. Removing items

`POST /bills/:billId/remove-lines`, body `{ lines: [{ lineId, wasPrepared }], reasonCode, note?, approval? }`. Reasons are the existing line cancel reasons.

1. Who: the same roles and the same approval rules as **cancelling a line before billing** today, from P28's `approvals.lineCancel`, so removing the bottle at the bill is no harder than removing it before the bill.
2. **Plus one rule:** when the bill has already been printed (`printCount` above 0), a CASHIER or WAITER needs a manager's PIN, when the new setting `approvals.revisePrintedBill` is on. Default `true`. Why: a printed bill has been shown to the guest. Lowering it after the guest has paid cash in hand, and keeping the difference, is the most common till fraud, and the cash count cannot catch it because expected cash falls too. The owner can switch this off.
3. Removing every live line is refused: "To remove everything, cancel the order instead." Cancelling the whole order voids the bill, which is correct, because no sale happened.

In one transaction:
1. Cancel each chosen order line through the existing `cancelLineInSession`, with its reason and `wasPrepared`, so stock and the kitchen ticket behave exactly as a cancel before billing.
2. Rebuild the bill's lines from the order's live lines, and recompute every total with `computeBillTotals` and `allocateLineShares`, through the same `applyTotals` code bill creation uses. The discount is re-applied as the existing rules say: a percent stays the same percent; a flat amount stays the same but never above the new item total.
3. Keep `billNumber`, `billSequence`, `invoiceSeries`, `billedAt` and `businessDate`.
4. Add 1 to a new field `revision`, starting at 0, and push to a new `revisions` array: `{ revision, at, by, approvedBy, kind: 'REMOVED', lines: [{ orderLineId, itemName, variantName, quantity, lineTotalInPaise, wasPrepared }], reasonCode, note, previousGrandTotalInPaise, newGrandTotalInPaise, wasPrinted }`.
5. Write audit `BILL_REVISED`, with the amount the bill went down by. In the audit trail, a MANAGER may see it, like line cancels.
6. Write the order event for each line cancel exactly as a cancel before billing does, if an order event log exists in this code.

### B4. Adding items

P26 voids a bill to add items after billing. For a bill that can be revised (B2), adding items revises it instead:

1. The existing "add items" flow on the bill screen adds the lines to the order, sends them to the kitchen as usual, and the bill's lines and totals are rebuilt as in B3 step 2, with a revision of kind `ADDED`.
2. No approval is needed to add items.
3. Billing rules for new lines: the order must be billable again before the bill can be paid. With Part C, that happens when the kitchen marks the new lines ready. Until then the bill shows "Waiting for the kitchen" and cannot take payment.
4. A bill that cannot be revised keeps P26's void-and-reopen path exactly as it is.

### B5. Printing a revised bill

1. The receipt and the full-page invoice show "Revised bill" under the invoice number when `revision` is above 0.
2. A reprint after a revision is not marked "Duplicate", because its content changed. A reprint with no change since the last print still is.
3. The e-bill link, if one exists, shows the current revision.

### B6. Where revisions show

1. **R15 Cancellations and Voids**: items removed this way appear in the items cancelled table, with the stage "Removed from the bill before payment". **They never appear in the voids table.**
2. **A new section in R15, "Bills changed before payment"**: bill number, time, removed or added, items, the amount before and after, who, who approved, and "after printing" when it was. The owner reads fraud here.
3. **R2 Day Close, controls**: a new line "Bills changed before payment (count), value removed".
4. **R10 Invoice Register**: one row per number as today, with "Revised" and the count when above 0. No new numbers are used.
5. The bill detail shows each revision in its timeline.

### B7. The screens

1. On an unpaid, revisable bill, each line has a small **Remove** button. One tap opens a short sheet: the reason buttons, "Was it already made?" for lines sent to the kitchen, the approval step only when B3 asks for one, and a confirmation that states the consequence: "Water Bottle ₹47.61 comes off bill CFA/C/22446. The bill becomes ₹746.00." Work the new total out with `computeBillTotals`, never by hand.
2. "Add items" works as today, and on a revisable bill it says "Add to this bill", not "Reopen".
3. On a bill that is paid or part paid, the existing "Cancel an item" flow stays, with its void and new bill, and says so before confirming.

### B7a. Old records

Bills voided by P25 and P26 before this prompt stay voided. Nothing is converted.

### B8. Checks

C1 and C2 hold on every revision, because totals are rebuilt by the same code.
C6 is unaffected: no number is used or skipped.
C7: a removed line is cancelled on the order and absent from the bill.
Add a check, C13 "Revision trail", ERROR: for every bill with `revision` above 0, the last revision's `newGrandTotalInPaise` equals the bill's `grandTotalInPaise`.

### B9. Tests

1. Golden day B05 (Half & Half Pizza, Ferrero Hazelnut Shake, Water Bottle, ₹795.00), before any payment: remove the shake. The bill keeps `CFA/C/22446`, its item total becomes ₹427.61, GST ₹21.38, round-off ₹0.01, bill total ₹449.00, `revision` 1, one revision record. No bill is voided. Then pay ₹449.00 in cash, and C1 to C4 and C13 pass for the day.
2. The same with the bill already printed: a CASHIER is refused without a PIN; with a manager's PIN it succeeds and the revision says `wasPrinted: true`. With `approvals.revisePrintedBill` off, no PIN is needed.
3. A bill with ₹100 paid: `remove-lines` is refused, and the existing cancel after billing still voids and rebills.
4. Removing every line is refused.
5. A flat discount larger than the new item total is capped. A percent discount stays the same percent.
6. Adding an item to a revisable bill revises it with kind `ADDED`, and payment is refused until the kitchen marks the new item ready.
7. R15 shows the removed shake as an item cancelled, "Removed from the bill before payment", and nothing in voids. R2 shows one bill changed before payment. R10 shows `CFA/C/22446` once, revised.
8. The receipt of a revised bill says "Revised bill", and is not marked "Duplicate".
9. With `reviseUnpaidBills` off, everything behaves exactly as before this prompt.

Commits, for example: `revise unpaid bills instead of voiding`, `add items to an unpaid bill`, `show revisions in reports and on prints`.

---

## Part C. Ready means served

### C1. The rule

When the kitchen marks an item ready, it is served. Captains no longer mark items served.
A new setting, `settings.kitchen.readyMeansServed`, default `true`, owner only, keeps the old two-step flow available for a restaurant that wants it.

### C2. On the server, when the setting is on

1. `markKotLinesReady`, and marking a whole ticket ready: the KOT line becomes `READY` as today, and the **order line becomes `SERVED`**, with both `readyAt` and `servedAt` set to the same moment.
2. When every live line of the order is then served, the order becomes `READY_TO_BILL` with `readyToBillAt`, exactly as `markLineServed` does today. Use the same code, moved into a shared function, not a copy.
3. `isReadyToBill` and billing do not change.
4. The mark-served endpoint stays for the setting's off state. With the setting on, it accepts lines that are `READY`, so nothing old is stuck.
5. P25's platform "food ready" call still fires when all food is ready.

### C3. Existing data

A one-time script, `npm run migrate:ready-to-served`, dry run by default, `--apply` to write: for each restaurant with the setting on, every order line still `READY` on an order that is open or ready to bill becomes `SERVED`, and orders whose live lines are then all served become `READY_TO_BILL`. It prints counts. Run it locally, and say in your summary that it must be run once on the cloud database.

### C4. The screens

1. With the setting on, remove the captain's "Mark served" buttons and any served step from the order screen and the floor.
2. The floor's states stay: Open, then "Served" when the kitchen has marked everything ready, then "Bill printed".
3. A line shows "Ready" with a tick, in the served state's colour, as soon as the kitchen ticks it.

### C5. Tests

1. With the setting on: marking a line ready makes it served; marking the last live line ready makes the order ready to bill, and it can be billed with no served step.
2. With the setting off: behaviour exactly as before.
3. The migration's dry run changes nothing, and `--apply` moves the right lines.
4. The golden day still passes end to end, with the served steps removed from the fixture when the setting is on. Keep one test running the fixture with the setting off.

Commits, for example: `make kitchen ready mean served`, `remove the served step from the screens`, `migrate ready lines to served`.

---

## Part D. Print the bill, then take payment

### D1. The order of the bill screen

With a new setting `settings.billing.printBeforePayment`, default `true`, owner only:

1. **Make bill.** If this device has a printer and its new device setting "Print the bill as soon as it is made" is on, it prints straight away. A captain's bill goes to the counter print queue from P25 Part D, as today.
2. **Until the bill has been printed once** (`printCount` above 0), the one primary action is **Print bill**. The payment method buttons are not shown. A small secondary action, "Take payment without printing", is there for guests who want an e-bill or no bill; it asks for no PIN and is recorded on the bill as `paymentBeforePrint: true`.
3. **Once printed**, the primary action becomes **Take payment**, and the payment method buttons, the note and coin counter and the Pine Labs "Send to machine" appear, as today.
4. Between print and payment, **Remove** and **Add to this bill** from Part B are right there, because this is exactly when the guest reads the bill.
5. After a revision, the primary action is **Print bill** again, showing "Print the revised bill", until it is printed.

### D2. On the server

No permission changes. The server keeps accepting payments on unprinted bills, because the client hides this, and staff may need it. `paymentBeforePrint` is set when a payment is recorded on a bill with `printCount` 0.
R15's "Bills changed before payment" section from B6 also lists, separately, bills paid before printing, for the owner to see how often it happens.

### D3. Tests

1. A bill with `printCount` 0 records `paymentBeforePrint: true` when paid.
2. Printing sets `printCount`, and a revision makes the next print a new print, not a duplicate.
3. With `printBeforePayment` off, the bill screen behaves exactly as before. Check this by hand in Part G.

Commits, for example: `print the bill before taking payment`.

---

## Part E. Undo in the kitchen

### E1. Undo one line or a whole ticket

`POST /kots/:kotId/lines/:lineId/undo-ready` and `POST /kots/:kotId/undo-ready`, the same roles that can mark ready.

Allowed only while the order has **no live bill**. After the bill is made, the screen says: "This table has been billed. Ask the cashier to change the bill."

In one transaction:
1. The KOT line goes back from `READY` to `PENDING`, and its `readyAt` is cleared.
2. The order line goes back to `FIRED`, clearing `readyAt`, and `servedAt` if Part C set it.
3. If the order was `READY_TO_BILL`, it goes back to `OPEN`, clearing `readyToBillAt`.
4. Write audit `KITCHEN_READY_UNDONE`, with the item names. In the audit trail, a MANAGER may see it. It is not an exception worth an alert, but it is a fact worth keeping.

### E2. Platform orders

P25 tells the platform when food is ready. A wrong tick must not reach the platform:
queue that call with `runAfter` 60 seconds in the future and a `dedupeKey` per order. An undo inside those 60 seconds cancels the queued job. After that, the undo still works here, and the screen says the platform has already been told.

### E3. The kitchen screen

1. When an item or ticket is ticked, a bar at the bottom of the screen shows "Paneer Makhni marked ready. **Undo**" for 10 seconds. Undo is a large button, at least 56 px tall.
2. A ready item stays on its ticket, struck through and faded, with a small **Undo** beside it, until the whole ticket is done.
3. A ticket that is done does not vanish at once: a **"Just done"** row at the top of the screen keeps the last 10 finished tickets, for 10 minutes, each with "Undo". After that they leave the screen.
4. To make wrong ticks rarer: each item's tap target covers the whole row, rows are at least 56 px tall with clear space between them, and marking a whole ticket ready needs a press-and-hold of half a second, with the button filling as it is held. Respect reduced motion: without animation, it asks "Mark all 6 ready?" instead.

### E4. Tests

1. Undo a line: KOT line pending, order line fired, order back to open from ready to bill.
2. Undo after the bill is made is refused with the message.
3. A platform order: undo within 60 seconds cancels the queued call; after it, the undo works and the call is not repeated.
4. Undo writes one audit line.

Commits, for example: `undo kitchen ready`, `add undo bar and just done row to the kitchen screen`.

---

## Part F. The cash book

The cash drawer and the cash part of Day Close become one screen, **Cash book**, that reads top to bottom like the owner's drawing.

### F1. The flow

```
  Brought forward       yesterday's cash kept in the drawer, with its notes
+ Top-ups               cash added: from the owner, from the bank, change
+ Cash sales            cash payments on bills today, live
+ Cash collections      On Hold accounts paid in cash today
- Expenses              cash spent, by category
- Cash taken out        cash removed that is not an expense: bank deposit, given to the owner
= Cash in drawer        what should be in the drawer now
```

### F2. What changes in the data

All additive.

1. Cash movement types gain `CASH_TAKEN_OUT`. Append only. Fields: `destination`, `BANK_DEPOSIT` or `OWNER` or `OTHER`, `takenBy`, a note, and an optional `cashCount`.
2. `PAID_IN` is shown as **Top-up** everywhere on screen, and gains `source`: `OWNER`, `BANK`, `CHANGE`, `OTHER`.
3. `PAID_OUT` is shown as **Expense** everywhere on screen, and gains `category`, from a new setting `settings.cash.expenseCategories`, owner only, a list of `{ code, label, isActive }`. Default: Milk and dairy, Vegetables and fruit, Groceries, Gas, Packaging, Cleaning, Repairs, Staff advance, Transport, Other. "Other" needs a note.
4. **Brought forward.** Day closures gain `keptForTomorrowInPaise` and `keptForTomorrowCount`, the notes left in the drawer for the next day, and `takenOutAtCloseInPaise`. The next business date's **opening float is proposed** from the last closed day's kept cash. When the cashier confirms it, an `OPENING_FLOAT` movement is recorded with `broughtForwardFrom` set to that date. If they recount and it differs, the difference is recorded on the movement as `openingDifferenceInPaise` with a required note, and it shows to the owner.
5. **Cash check.** A new movement type `CASH_CHECK`, with a `cashCount`, recorded without closing the day, for a count during service or at a shift change. It moves no money. Its difference from the cash in drawer at that moment is stored on it.

Expected cash everywhere, in `computeDayFigures` and Day Close, becomes:
brought forward or opening float, plus top-ups, plus cash sales, plus cash collections, minus expenses, minus cash taken out.
Old days are unaffected, because they have no `CASH_TAKEN_OUT`.

### F3. Closing the day

Day Close's cash part moves into the cash book's last step, in this order:
1. **Count the drawer**, by notes and coins with `CashCounter`, or as one amount. The blind count rule stays exactly as it is.
2. **Keep for tomorrow**: how much stays in the drawer, by notes or as one amount, defaulting to the restaurant's usual float, a new setting `settings.cash.usualFloatInPaise`, default ₹2,000. It cannot be more than the count.
3. **The rest is taken out**: shown as counted minus kept, with where it goes, Bank deposit or Owner, and by whom. Recorded on the day closure as `takenOutAtCloseInPaise`, after the count, so it never changes the expected cash or the difference.
4. The day closes as today, with its blockers and checks.

### F4. Who sees the total

The blind count from M16 must still work. So:
1. The OWNER always sees **Cash in drawer** live.
2. Staff see every line of the flow except **Cash in drawer** and any difference, unless a new setting `settings.cash.showDrawerTotalToStaff` is on. Default `false`, matching the existing `dayClose.showCashDifferenceToManager`.
3. Whatever the setting, at Day Close the count is entered before any expected figure is shown.
4. The server leaves these fields out of its responses for roles that may not see them. Never hide them only on screen.

### F5. Who may do what

| Action | OWNER | MANAGER | CASHIER |
|---|---|---|---|
| Confirm the opening float | yes | yes | yes |
| Top-up | yes | yes | yes, with a PIN when P28's `approvals.paidIn` is on |
| Expense | yes | yes | with a PIN when P28's `approvals.managerTasks` is on |
| Cash taken out | yes | yes | no |
| Cash check | yes | yes | yes |
| Close the day, keep for tomorrow | yes | yes | no |
| Expense categories, usual float, staff total switch | yes | no | no |

Voiding any of these keeps the existing rules for voiding a cash movement. If they differ from the row above, follow the code and say so.
| Void any of these | yes | yes | no |

### F6. The screen

One page, **Cash book**, reached from the rail. Follow `docs/DESIGN-SYSTEM.md`: every amount through `Money`, the totals in the hero size, one primary action.

**Wide screen, 1024 px and over**: the flow runs left to right as five cards joined by large plus and minus signs, the way the owner drew it, ending in a wider **Cash in drawer** card. Under it, two columns: the day's entries on the left, the actions on the right.

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐
│ Brought      │ + │ Top-ups      │ + │ Cash sales   │ − │ Expenses     │ − │ Taken out    │ = │ Cash in drawer    │
│ forward      │   │ ₹1,000       │   │ ₹6,240       │   │ ₹830         │   │ ₹0           │   │ ₹8,410            │
│ ₹2,000       │   │ 2 entries    │   │ 23 bills     │   │ 3 entries    │   │              │   │ checked 4:10 PM   │
│ from Thu     │   │              │   │ + ₹0 On Hold │   │              │   │              │   │ difference ₹0     │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └───────────────────┘

┌─ Today ──────────────────────────────────┐   ┌─ Record ──────────────────┐
│ 11:02  Opening float  ₹2,000  Ramesh     │   │ [ + Top-up             ]  │
│ 12:40  Expense  Milk and dairy  ₹420     │   │ [ − Expense            ]  │
│ 14:15  Top-up  From the owner  ₹1,000    │   │ [   Take cash out      ]  │
│ 16:10  Cash check  ₹8,410  difference 0  │   │ [   Check cash         ]  │
│ ...                                      │   │                           │
│ Expenses by category                     │   │ [ Close the day        ]  │
│ Milk and dairy ₹420  Vegetables ₹410     │   └───────────────────────────┘
└──────────────────────────────────────────┘
```

**Phone and tablet under 1024 px**: the same flow as a stacked list, one line per step with its sign in a wide left column and the amount right-aligned, the **Cash in drawer** line last and largest. Below it, the four record buttons in a 2 by 2 grid, then the day's entries.

Each card or line opens its entries: Top-ups lists each top-up; Cash sales lists the cash bills; Expenses lists by category with totals.

**Recording**, each in a sheet:
1. **Top-up**: amount by keypad or by notes; source as four buttons; note optional; approval step only when required.
2. **Expense**: category as large buttons, the most used first; amount by keypad; note, required for Other; "Same as last time" when the category was used in the last 7 days, filling the amount.
3. **Take cash out**: amount by keypad or by notes; Bank deposit or Owner; who took it.
4. **Check cash**: the note and coin counter. Afterwards the owner sees the difference. Staff see "Check saved".
5. **Close the day**: count, keep for tomorrow, the rest taken out, F3.

**Brought forward**, at the start of a business day: the first card shows "From Thu 8 Oct: ₹2,000, 4 × ₹500" with **Confirm** as the primary action, and "Count again" beside it.

**Yesterday at a glance**: a small row under the flow, "Yesterday: counted ₹12,400, kept ₹2,000, taken out ₹10,400 to the bank", linking to that day's close.

The old Cash drawer page routes to the cash book, so old links still work. Day Close keeps its sales, money and controls sections, and its cash section links to the cash book.

### F7. Reports and Tally

1. **R7 Cash Till** gains columns: brought forward, top-ups, expenses, cash taken out, kept for tomorrow, opening difference. A new section, **Expenses by category**, per day and for the range.
2. **R2 Day Close** shows the same lines in its cash section.
3. If P25's Tally vouchers exist: each expense category maps to its own ledger in the Tally mapping, falling back to the existing paid-out ledger; a top-up maps by source; **cash taken out to the bank is a contra entry, Cash to the bank ledger, never an expense**; cash given to the owner maps to the owner's drawings ledger, a new head. Every voucher still balances.

### F8. Checks

C9 Cash drawer uses the new expected cash formula.
Add C14 "Brought forward", WARNING: a day's confirmed opening float differs from the previous closed day's kept cash. The message names both amounts and the note.

### F9. Tests

1. Golden day with the new flow: opening float ₹2,000.00 recorded as brought forward, paid out ₹350.00 as an Expense in Milk and dairy, cash sales ₹1,754.00: cash in drawer ₹3,404.00. Count ₹3,400.00: difference −₹4.00, as `docs/TEST-DATA.md` says. Keep ₹2,000.00 for tomorrow: taken out at close ₹1,400.00, and the next day proposes ₹2,000.00 brought forward.
2. A mid-day cash taken out of ₹1,000.00 to the bank lowers cash in drawer by ₹1,000.00, is not counted as an expense in R7, and in Tally is a contra entry.
3. Confirming a different opening float needs a note and raises C14.
4. A CASHIER's response leaves out cash in drawer and any difference, with the switch off; includes them with it on. The OWNER always sees them.
5. A cash check records a count and a difference and moves no money.
6. Keeping more than the count is refused.
7. Expense "Other" without a note is refused.

Commits, for example: `add cash taken out, expense categories, top-up sources`, `bring forward yesterday's kept cash`, `add cash checks`, `build the cash book screen`, `show the new cash lines in reports and tally`.

---

## Part G. Full check

1. `npm test`, the whole suite, with counts before Part A and now.
2. `npm run lint`, `npm run build`, `npm run e2e`.
3. New Playwright spec `e2e/billRevision.spec.js`: a cashier makes a bill, it prints, the guest says the water bottle was not theirs, the cashier removes it with a manager's PIN, the revised bill prints, and payment is taken. The bill list shows one bill, revised, and no voided bill.
4. New Playwright spec `e2e/kitchenUndo.spec.js`: a station ticks the wrong dish, taps Undo in the bar, ticks the right one, and the captain's screen shows the right dish ready.
5. New Playwright spec `e2e/cashBook.spec.js`: the owner confirms the brought-forward float, a cashier adds a top-up and an expense, the owner takes cash out to the bank, and closes the day keeping ₹2,000; the next day opens with ₹2,000 brought forward.
6. By hand, at 380, 768 and 1280 px wide, checked against section 14 of `docs/DESIGN-SYSTEM.md`: the bill screen before and after printing, the kitchen screen with the undo bar and the "Just done" row, and the cash book.
7. `npm run db:indexes` twice. The second run creates nothing.

---

## 6. Non-negotiable rules that apply

"Bill numbers are generated on the server, are sequential, and are never reused." A revision keeps its number. It never uses a new one.
"Never hard delete a bill, order, or stock entry." Removed lines are cancelled on the order, and the revision keeps what was removed and by whom.
"Store all money as whole paise integers."
"Tax arithmetic lives in `server/utils/tax.js`." Revisions recompute through it.
"Check permissions on the server for every endpoint." The cash totals are left out by the server, never only hidden.
"Reports only add up values frozen onto records."
"Schema changes are additive."
"Never create a bill in production to test something."

## 7. Golden day

Part B's test 1 and Part F's test 1 use the golden day. If any figure differs from `docs/TEST-DATA.md`, do not change the expected figure. Find which side is wrong and tell me.

## 8. Open question for Z Chaat's CA

Changing the amount of a bill after its invoice number is printed and before it is paid: confirm this is acceptable under GST for their B2C bills. Until then, the owner can switch `billing.reviseUnpaidBills` off and get the old void-and-rebill behaviour. Add this to `docs/clients/zchaat/PROFILE.md`'s "To confirm" list.

## 9. Out of scope

Editing a bill after any payment. That stays void and rebill.
Editing a bill on a closed day.
Changing prices or discounts by revision. Only items are removed or added; discounts change through the existing discount flow.
Shifts with their own cash counts. Cash checks cover a shift change for now.
Expense receipts as photos.

## 10. Docs to update

1. `docs/PROJECT-STATE.md`: the date line; "Current stage"; the P29 progress table, all ticked; decision log rows, dated today, for: unpaid bills are revised, never voided, and a printed bill's revision needs a PIN by default; ready means served by setting; print before payment by setting; kitchen undo until billed, with the platform call delayed 60 seconds; the cash book flow, cash taken out as its own type, expense categories, brought forward with an opening difference, cash checks; the drawer total hidden from staff by default; and every place the build differed from this prompt.
2. `docs/prompts/README.md`: add P29, marked Done.
3. `docs/clients/zchaat/PROFILE.md`: the CA question in section 8.

## 11. Done when

1. Every part's tests pass, and in Part G the whole suite, lint, build, every e2e spec and the index check pass.
2. The two one-time scripts, `migrate:ready-to-served`, and any other, are listed in the summary with the exact commands to run on the cloud database.
3. Every doc in section 10 is updated.
4. Every part is committed and pushed to `main`, and the progress table is fully ticked.
5. Print a short summary: commits; endpoints and fields added; test counts before and after; and anything that surprised you.
