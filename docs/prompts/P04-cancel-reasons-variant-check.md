# P04 Cancel reasons and the variant check

**Model:** Sonnet, medium effort. Switch to Opus, high, if the cancel or void code turns out to run inside transactions you need to change.
**Branch:** none. Commit directly to `main`.
**Depends on:** P03.

---

## 1. What to build, in one sentence

Replace free-text reasons for cancelling an item, cancelling an order and voiding a bill with fixed reason codes plus an optional note, write the audit lines that are missing for cancellations, and stop an out-of-stock variant or add-on from being ordered.

## 2. Module

M2 Order Taking and KOT, plus the void reason in M3, plus two audit actions that M8 will read.

## 3. Why

The cancellations report, R15 in `docs/REPORT-SPEC.md`, groups by reason.
Free text cannot be grouped: "wrong item", "Wrong Item", "wrng itm" and "mistake" are four groups for one reason.
Caffeza's own system uses fixed reasons, "Modification" and "Wrong Item", and their old reports show it.

Two gaps found while planning this:

1. `ORDER_CANCELLED` is in the audit action list, and `docs/API-CONTRACT.md` M8 section 1 says M2 writes it, but nothing in the code writes it. Cancelling a whole order leaves no trace today.
2. An item cancelled after the kitchen made it is thrown-away food, and nothing records it as an exception. `docs/CAFFEZA-BUILD-PLAN.md` section 6 assigns `LINE_CANCELLED_AFTER_PREP` to this prompt.

And one known problem, OPEN since 29 August in `docs/PROJECT-STATE.md`:
ordering an out-of-stock variant of an available item is not blocked. "Paneer Tikka" available with "Half plate" marked out of stock still lets a half plate onto an order.
Add-ons have the same `isAvailable` flag and the same gap.

---

## 4. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P04-cancel-reasons-variant-check.md`.
2. `git pull`. `git status` should show only that file. If anything else is uncommitted, stop and list it.
3. Run `npm test` and record the count. If anything fails before you start, stop and tell me.

## 5. Files to read first

1. `docs/API-CONTRACT.md` section 12, the order endpoints, especially cancelling a line and cancelling an order. Section 14, voiding a bill. The M8 section 1 table.
2. `docs/DB-SCHEMA.md` section 9 `orders`, section 12 `bills`, section 13 `auditlogs`.
3. `docs/REPORT-SPEC.md` R15.
4. `server/models/Order.js`, `server/models/Bill.js`, `server/models/AuditLog.js`, `server/models/MenuItem.js`.
5. `server/validators/orderValidators.js` from line 280, and `server/validators/billValidators.js`.
6. `server/services/orderService.js`, especially `buildLineSnapshots` and `assertWasPreparedRule`.
7. `server/controllers/orderController.js`, the line cancel and order cancel handlers.
8. `voidBill` in `server/services/billService.js`, and how it calls `recordAudit`.
9. `server/routes/orderRoutes.js`, to see who may cancel what.
10. On the client: `client/src/features/orders/OrderLineList.jsx`, `client/src/features/orders/OrderScreenPage.jsx`, `client/src/features/billing/VoidBillPanel.jsx`, and whichever component shows variants and add-ons when a dish is picked.
11. `server/tests/timeDisplay.test.js` from P01, for the pattern of a server test that imports a client file to check a mirror.

---

## 6. The reason lists

Create `server/config/cancelReasons.js` exporting three frozen lists.
Each entry has a `code` and a `label`.
The labels are what staff see on the buttons and what reports print.

**Cancelling an item, `LINE_CANCEL_REASONS`**

| Code | Label |
|---|---|
| `MODIFICATION` | Guest changed the order |
| `WRONG_ITEM` | Wrong item entered |
| `DUPLICATE` | Entered twice |
| `OUT_OF_STOCK` | Kitchen ran out |
| `TOO_SLOW` | Took too long |
| `QUALITY` | Quality complaint |
| `GUEST_LEFT` | Guest left |
| `OTHER` | Other |

**Cancelling a whole order, `ORDER_CANCEL_REASONS`**

| Code | Label |
|---|---|
| `GUEST_LEFT` | Guest left |
| `WRONG_TABLE` | Opened on the wrong table |
| `DUPLICATE` | Opened twice |
| `OTHER` | Other |

**Voiding a bill, `BILL_VOID_REASONS`**

| Code | Label |
|---|---|
| `WRONG_TABLE` | Billed to the wrong table |
| `ITEMS_CHANGED` | Items need changing |
| `DISCOUNT_CHANGED` | Discount needs changing |
| `DUPLICATE` | Billed twice |
| `GUEST_DISPUTE` | Guest disputed the bill |
| `OTHER` | Other |

These are code constants, not settings.
`docs/API-CONTRACT.md` M7 says a closed list the software depends on is a constant, like the role list.
Reports group by code, so a restaurant renaming codes would split its own history.
Adding a reason later is an append to the list, never a rename.

Mirror the three lists, codes and labels only, in `client/src/features/orders/cancelReasons.js`.
That file has no imports, so a server test can load it.
A test checks the two files hold exactly the same codes and labels in the same order.

---

## 7. The request and the stored fields

### 7a. Requests

The three endpoints change from `reason` to `reasonCode` plus `note`:

```json
{ "version": 4, "reasonCode": "WRONG_ITEM", "note": "Captain tapped the wrong pizza", "wasPrepared": false }
```

| Field | Rule |
|---|---|
| `reasonCode` | Required. One of the codes from the matching list. Anything else is 400 VALIDATION_FAILED, listing the allowed codes. |
| `note` | Optional, trimmed. Required and non-empty when `reasonCode` is `OTHER`. Same maximum length as the current reason field on that endpoint. |
| `version`, `wasPrepared` | Unchanged |

The old `reason` field is no longer accepted. The strict schemas will reject it.
The client is updated in the same prompt, so nothing calls the old shape.

### 7b. Stored fields, all additive

| Collection | New field | Notes |
|---|---|---|
| `orders.lines[]` | `cancelReasonCode` | String or null. Enum from `LINE_CANCEL_REASONS`. |
| `orders` | `cancelReasonCode` | String or null. Enum from `ORDER_CANCEL_REASONS`. |
| `bills` | `voidReasonCode` | String or null. Enum from `BILL_VOID_REASONS`. |

The existing text fields stay, `orders.lines[].cancelReason`, `orders.cancelReason` and `bills.voidReason`.
From now on they hold the note, which may be null.
Records from before this prompt have a code of null and their old free text in the note field. Do not convert them.

Every response that returns these records includes both the code and the note.

---

## 8. Audit lines

Use the existing `recordAudit` helper, the same way `voidBill` does.
If the cancel runs inside a transaction, write the audit line inside it, so a cancel that rolls back leaves no audit line.

Append `LINE_CANCELLED_AFTER_PREP` to `AUDIT_ACTIONS` in `server/models/AuditLog.js`. Append only. Never reorder or rename.

**Item cancelled after preparation.**
When a line is cancelled with `wasPrepared: true`:

```
action: LINE_CANCELLED_AFTER_PREP
entityType: ORDER
entityId: the order's _id
entityLabel: "Order {orderNumber}"
reason: the label, then ": " and the note when there is one
amountInPaise: the line total, using computeLineTotalInPaise
details: { lineId, itemName, variantName, quantity, reasonCode, tableName }
```

A line cancelled before preparation writes nothing. That is normal operation, and M8 section 3 says normal operation is not audited.

**Whole order cancelled.**
Every whole-order cancel writes:

```
action: ORDER_CANCELLED
entityType: ORDER
entityId: the order's _id
entityLabel: "Order {orderNumber}"
reason: label plus note, as above
amountInPaise: the sum of the line totals of every line that was not already cancelled
details: { orderNumber, tableName, lineCount, reasonCode, wasPrepared }
```

**Bill voided.**
`BILL_VOIDED` is already written. Add `reasonCode` to its `details`, and use label plus note as its `reason`.

---

## 9. The variant and add-on check

In `buildLineSnapshots` in `server/services/orderService.js`:

1. After finding the variant, if `variant.isAvailable` is false, throw `BusinessRuleError` with: `The {variant name} size of "{item name}" is out of stock right now.`
2. After finding each add-on, if `addOn.isAvailable` is false, throw `BusinessRuleError` with: `"{add-on name}" is out of stock right now.`

These sit beside the existing item checks, in the same style.

On the client, wherever a captain picks a variant or add-on, show an unavailable one greyed out with "Out of stock", and do not let it be selected.
Check that the menu response already carries `isAvailable` for variants and add-ons. If it does not, add it to the response, and note it in the contract.

---

## 10. The client

1. **Cancelling an item** in `OrderLineList.jsx`: replace the reason text box with one large button per reason, laid out for a phone held in one hand. Below them, an optional note box. When "Other" is chosen, the note becomes required, and the confirm button stays disabled until it has text.
2. **Cancelling a whole order** in `OrderScreenPage.jsx`: the same pattern, with the order list.
3. **Voiding a bill** in `VoidBillPanel.jsx`: the same pattern, with the void list.
4. Keep the existing `wasPrepared` question exactly as it works today.
5. Use the labels from `client/src/features/orders/cancelReasons.js`, never typed again in a component.
6. Wherever a cancelled line or a voided bill is shown, show the label and the note.

Follow `docs/DESIGN-SYSTEM.md` for buttons and spacing. Do not invent new styles.

---

## 11. The spec, first

Before writing code, update and commit, as `add cancel reason codes spec`:

1. `docs/API-CONTRACT.md` section 12: the new request shape for cancelling a line and cancelling an order, with the reason table, and the variant and add-on errors on adding lines.
2. `docs/API-CONTRACT.md` section 14: the new request shape for voiding a bill.
3. `docs/API-CONTRACT.md` M8 section 1: add `LINE_CANCELLED_AFTER_PREP`, written by M2, and change the `ORDER_CANCELLED` row to say it is written by M2 from P04 onwards.
4. `docs/DB-SCHEMA.md` sections 9, 12 and 13: the three new fields, and the new audit action.
5. `docs/GLOSSARY.md` section 9: add a row: "**Cancel reason**: chosen from a fixed list in `server/config/cancelReasons.js`, with an optional note. A note is required for Other."

---

## 12. Permissions

None change.
Cancelling a line stays OWNER, MANAGER, CASHIER and WAITER.
Cancelling a whole order stays OWNER and MANAGER.
Voiding a bill keeps its current roles.

Caffeza's kitchen stations cancel items in their current system.
Ours does not allow KITCHEN to cancel.
Do not change that here. Add it to open questions, if P02 has not already, so it is decided on purpose.

---

## 13. Tests

**Reasons**
1. Each of the three endpoints accepts every code in its list.
2. An unknown code is 400 VALIDATION_FAILED, and the message lists the allowed codes.
3. `OTHER` without a note is 400. `OTHER` with a note is accepted.
4. A note longer than the maximum is 400.
5. Sending the old `reason` field is 400.
6. The code and note are stored and returned.
7. The client and server reason files hold the same codes and labels, in the same order.

**Audit**
8. Cancelling a fired line with `wasPrepared: true` writes one `LINE_CANCELLED_AFTER_PREP` line with the line total as `amountInPaise` and the reason code in `details`.
9. Cancelling a pending line writes no audit line.
10. Cancelling a whole order writes one `ORDER_CANCELLED` line, with `amountInPaise` equal to the live line totals and not counting lines already cancelled.
11. Voiding a bill writes `BILL_VOIDED` with `reasonCode` in `details`.
12. If the cancel fails partway, for example on a version conflict, no audit line is left behind.

**Availability**
13. Adding a line with an unavailable variant is refused with the variant message, and the order is unchanged.
14. Adding a line with an unavailable add-on is refused with the add-on message.
15. The same item with an available variant and available add-ons still adds.

Run the full suite at the end. Every test that passed before must still pass.

---

## 14. Non-negotiable rules that apply

"Never hard delete a bill, order, or stock entry. Mark it cancelled or voided and keep it."
"Check permissions on the server for every endpoint. Hiding a button in React is not security."
"Schema changes are additive: new fields with defaults, nothing renamed or removed." The text fields stay. Only the request shape changes.
From `docs/API-CONTRACT.md` M8 section 3: normal operation is not audited. Only the exceptions in section 8 of this prompt write audit lines.

## 15. Checks and golden day

C7 in `docs/RECONCILIATION-RULES.md`: a cancelled line never appears on a bill. The existing bill code already leaves out cancelled lines. Add one test that confirms it still does after this change.
The golden day's B13 has two cancelled items: Thecha Paneer Chilli after preparation, reason `MODIFICATION`, and Cheesy Tornado before preparation, reason `WRONG_ITEM`. Build that order through the API in a test: the bill is ₹420.00, exactly one `LINE_CANCELLED_AFTER_PREP` line is written for ₹390.00, and none for the Cheesy Tornado.

---

## 16. Docs to update

1. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P05, kitchen stations."
   3. Known problems: the out-of-stock variant row becomes "FIXED in P04. Add-ons are checked too."
   4. Decision log, dated today:
      "Cancel and void reasons are fixed code lists in `server/config/cancelReasons.js`, mirrored on the client, with an optional note that is required for Other. | Reports group by reason, and free text cannot be grouped. Caffeza already works with fixed reasons."
      "An item cancelled after preparation writes `LINE_CANCELLED_AFTER_PREP`, and a whole-order cancel now writes `ORDER_CANCELLED`, which was listed but never written. | Thrown-away food and disappearing orders are the exceptions an owner needs to see."
      "Ordering an unavailable variant or add-on is refused. | The kitchen switched it off for a reason."
   5. "What changed recently": a P04 entry at the top, and the oldest entry moved to `docs/archive/SESSION-LOG.md`.
2. `docs/prompts/README.md`: mark P04 as Done.

---

## 17. Out of scope

Letting KITCHEN cancel items.
Discount reasons. They change in P08, together with who may apply platform discounts.
Converting old free-text reasons into codes.
Any report screen. R15 is built in P17.

---

## 18. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. Locally, on a phone-sized browser window: cancel an item with "Wrong item entered", cancel one with "Other" and a note, and void a bill with "Billed to the wrong table". Each shows its label afterwards.
4. Locally: mark one variant of a dish out of stock. It shows greyed out with "Out of stock" and cannot be picked.
5. Every doc in section 16 is updated.
6. Commits on `main`, one line each, for example:
   `add cancel reason codes spec`
   `add fixed cancel and void reasons`
   `write audit lines for cancellations`
   `block unavailable variants and add-ons`
   `update docs for p04`
7. Push `main`.
8. Print a short summary: commits, files changed, test counts before and after, and anything that surprised you.
