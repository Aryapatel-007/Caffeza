# P02 Settings: feature switches, invoice series, and docs cleanup

**Model:** Opus, high effort.
**Branch:** none. Commit directly to `main`.
**Depends on:** P01.

---

## 1. What to build, in one sentence

Clean out the docs nobody needs any more, then add two setting groups to M7: switches that turn inventory and attendance off for a restaurant, and an invoice series with its own prefix and starting number, so Caffeza can continue its `CFA/C/` numbering.

## 2. Module

M7 Restaurant Settings.
It also touches M3 (bill numbers), M4 (inventory routes and stock deduction), M5 (attendance routes) and M6 (two reports and the dashboard).

---

## 3. Step 0. Save this prompt and check the repo

1. Save this entire prompt, exactly as given, to `docs/prompts/P02-settings-switches-invoice-series.md`.
2. `git pull`. Run `git status`. Nothing should be uncommitted except that file. If anything else is, stop and list it.
3. Run `npm test` once and record the count. It should be 578 passing. If anything fails before you start, stop and tell me.

## 4. Files to read first

1. `docs/API-CONTRACT.md`, the whole "M7 Restaurant Settings" section, and section 14 on bills.
2. `docs/DB-SCHEMA.md` sections 11 `counters`, 12 `bills` and 17 `restaurants.settings`.
3. `docs/CONVENTIONS.md` section 3, the error codes.
4. `docs/CAFFEZA-PROFILE.md` section 4, invoice numbers.
5. `server/models/Restaurant.js`, `server/models/Counter.js`, `server/models/Bill.js`.
6. `server/services/settingsService.js`, `server/validators/settingsValidators.js`, `server/routes/settingsRoutes.js`.
7. `server/services/billNumberService.js` and `createBill` in `server/services/billService.js`.
8. `server/utils/errors.js`.
9. `server/routes/inventoryRoutes.js`, `server/routes/attendanceRoutes.js`, `server/routes/reportRoutes.js`.
10. `server/services/kitchenService.js` around line 157, where stock is deducted on fire.
11. `server/controllers/orderController.js`, where `returnStockForCancelledLine` is called.
12. `me` in `server/controllers/authController.js`.
13. On the client: `client/src/App.jsx`, `client/src/features/dashboard/DashboardPage.jsx`, `client/src/features/reports/ReportShell.jsx`, `client/src/features/reports/TodayPage.jsx`, and `client/src/features/settings/SettingsPage.jsx`.

---

## 5. Part A. Docs cleanup

Delete these two files with `git rm`:

| File | Why it goes |
|---|---|
| `docs/archive/PROJECT-PLAN_1.md` | 2,431 lines describing an early plan for M0 to M2 only. The audit found it contradicts the current contract. Git history keeps it if anyone ever needs it. |
| `docs/PROJECT-INSTRUCTIONS.md` | The custom instructions for the Claude Project chat. They live in that Project's settings, nothing in the build reads this copy, and a second copy will drift out of date. |

Then:

1. In `docs/archive/README.md`, remove the line about `PROJECT-PLAN_1.md`.
2. Search every `.md` file for the two names. Leave mentions inside dated history, like old "What changed recently" entries and old decision log rows, exactly as they are. Change any other mention so it no longer points at a missing file.

Keep everything else. In particular, keep these, even though they may look old:

| File | Why it stays |
|---|---|
| `docs/M0-SUMMARY.md`, `docs/M1-SUMMARY.md` | The only readable explanation of how M0 and M1 were built. Needed for the module reviews. |
| `docs/CURRENT-STATE-AUDIT.md` | `CLAUDE.md` points to it for "what exists and where" |
| `docs/archive/SESSION-LOG.md` | Every prompt moves its oldest session entry here |
| `docs/prompts/P00` and `P01` | The record of what each change was meant to do. Useful when debugging later. |
| `docs/DEPLOYMENT.md`, `docs/GO-LIVE.md` | Needed from P12 onwards |

Commit this part on its own: `remove stale docs`.

---

## 6. Part B. Write the spec first

Before any code, update the spec and commit it on its own, as `add m7 feature switches and invoice series spec`.

1. `docs/API-CONTRACT.md`, M7 section: the two new groups in section 1, the new response shape in section 2, the new PATCH rules and error codes in section 3, and the new `features` block on `GET /auth/me`.
2. `docs/API-CONTRACT.md` section 14: bills gain `invoiceSeries`, and the bill number format depends on settings.
3. `docs/DB-SCHEMA.md` section 17: the two new groups. Section 12: `invoiceSeries` on `bills`. Section 11: the new counter scope for a prefix series.
4. `docs/CONVENTIONS.md` section 3: add the four new error codes from Parts C and D to the example list.

Write it from sections 6 and 7 of this prompt. Those sections are the spec.

---

## 7. Part C. The settings

### C1. The new setting groups

Added to `restaurants.settings`. Every field has a default, so existing restaurants need no migration, the same way M7 was built.

`settings.features`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `inventory` | Boolean | `true` | M4 is in use for this restaurant |
| `attendance` | Boolean | `true` | M5 is in use for this restaurant |

The defaults are `true` so nothing changes for any existing restaurant or any existing test.
Caffeza's setup in P11 switches both off.

`settings.invoice`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `mode` | String | `FINANCIAL_YEAR` | Enum `FINANCIAL_YEAR`, `PREFIX` |
| `prefix` | String or null | `null` | Used only in `PREFIX` mode. Like `CFA/C/`. |
| `startingNumber` | Number or null | `null` | Used only in `PREFIX` mode. The first number the series issues. |

What the two modes produce:

| Mode | Example | Counter | Resets |
|---|---|---|---|
| `FINANCIAL_YEAR` | `2026-27/000148` | scope = the financial year, as today | Every 1 April, as today |
| `PREFIX` | `CFA/C/22442` | scope = `PREFIX:` followed by the prefix, for example `PREFIX:CFA/C/` | Never. It runs on across financial years. |

`FINANCIAL_YEAR` is exactly today's behaviour. Nothing about it changes.
In `PREFIX` mode the number is not padded: `CFA/C/22442`, not `CFA/C/000022442`.

### C2. Validation on `PATCH /settings`

Through the existing settings validator, rejecting unknown keys as it already does.

`invoice` is validated as a whole group.
If any of its three fields is sent, all three must be sent, so the stored group is never half-changed.

| Rule | Error |
|---|---|
| `mode` is `FINANCIAL_YEAR` and `prefix` or `startingNumber` is not null | 400 VALIDATION_FAILED |
| `mode` is `PREFIX` and `prefix` is missing or null | 400 VALIDATION_FAILED |
| `prefix` is not 1 to 7 characters, using only letters, digits, `/` and `-` | 400 VALIDATION_FAILED. Message: "An invoice prefix can use letters, numbers, / and -, up to 7 characters." |
| `startingNumber` is not a whole number from 1 to 999,999,999 | 400 VALIDATION_FAILED |

Why 7 characters and 9 digits:
GST rules allow an invoice number of at most 16 characters, using only letters, numbers, `-` and `/`, unique within the financial year.
7 plus 9 is 16, so no number this series issues can break that rule.

`features.inventory` and `features.attendance` must be booleans. Nothing else.

### C3. Business rules for the invoice series

These protect the two unique indexes on `bills`: `{ restaurantId, billNumber }`, and `{ restaurantId, branchId, financialYear, billSequence }`.
Breaking either one would make bill creation fail at the till, in the middle of service.

Check them in the service, not in the validator, because they read the database. Each is 422 with its own code.

1. **Starting a new prefix series.**
   When the request's `prefix` has never issued a bill for this restaurant, meaning no `PREFIX:<prefix>` counter exists yet:
   `startingNumber` must be greater than the highest `billSequence` on any bill of this restaurant in the current financial year, in any series.
   Otherwise: code `INVOICE_START_TOO_LOW`, message "The starting number must be above {highest}, the highest bill number already used this financial year."
   With no bills at all this year, any starting number from 1 is fine. That is Caffeza's production database on cutover day.

2. **A prefix that has already issued bills cannot be restarted or returned to.**
   A prefix "has issued bills" when its `PREFIX:<prefix>` counter exists with a value above zero.
   If the stored prefix has issued bills, its `startingNumber` cannot change.
   If the request switches to a different prefix that has issued bills in the past, that is refused too.
   Both refuse with code `INVOICE_SERIES_STARTED`, message "{prefix} has already issued bills up to {prefix}{last}. Its starting number cannot change, and it cannot be started again."
   Sending the stored values back unchanged is not an error.

3. **No switching back to financial-year numbering in the middle of a year.**
   When the request sets `mode` to `FINANCIAL_YEAR`, and this restaurant has any bill in the current financial year whose `invoiceSeries` is a prefix:
   refuse with code `INVOICE_SERIES_LOCKED`, message "Bills have already been issued under {prefix} this financial year. You can switch back on or after 1 April."

Every change still writes `SETTINGS_CHANGED` audit lines through the existing settings audit code, one per field that changed.

### C4. Numbering a bill

In `server/services/billNumberService.js`, change `reserveBillNumber` so its caller passes the invoice settings in.
`createBill` reads them through `settingsService` and passes them on, inside the same transaction.

`FINANCIAL_YEAR` mode: exactly what it does today.

`PREFIX` mode, all inside the existing transaction:

1. Counter filter: `{ restaurantId, branchId, name: BILL, scope: 'PREFIX:' + prefix }`.
2. `updateOne` with `$setOnInsert: { value: startingNumber - 1 }` and `upsert: true`, so a brand-new series starts at `startingNumber - 1`.
3. Then the existing `findOneAndUpdate` with `$inc: { value: 1 }`.
4. `billNumber` is `prefix + value`. `billSequence` is `value`. `financialYear` is still the financial year of the bill, as today.

Every bill gets a new field, `invoiceSeries`:
the financial year, like `2026-27`, in `FINANCIAL_YEAR` mode,
and the prefix, like `CFA/C/`, in `PREFIX` mode.
It is additive. Bills created before this have `null`, which means "the financial year series". The invoice register in M19 groups by it.

Keep `formatBillNumber` working for the existing tests. Add the prefix format beside it.
`CLAUDE.md` says money arithmetic lives in `money.js` and `tax.js`. Bill numbering is neither, and stays in `billNumberService.js`.

### C5. The settings response

`GET /settings` and the `PATCH` response gain both groups:

```json
"features": { "inventory": true, "attendance": true },
"invoice": { "mode": "FINANCIAL_YEAR", "prefix": null, "startingNumber": null }
```

`GET /auth/me` gains a top-level `features` object with the same two booleans, for every role.
Every screen needs to know what to hide, and `GET /settings` is owner and manager only.

---

## 8. Part D. What switching a feature off does

### D1. On the server

Add a middleware, `requireFeature(name)`, in `server/middleware/`.
It reads `features` through `settingsService`, which already caches on `req`.
When the feature is off it throws a new error, `FeatureDisabledError`: 403, code `FEATURE_DISABLED`.
Message for inventory: "Inventory is switched off for this restaurant. An owner can switch it on in Settings."
Message for attendance: the same, with "Attendance".

Add the four new codes, `FEATURE_DISABLED`, `INVOICE_START_TOO_LOW`, `INVOICE_SERIES_STARTED` and `INVOICE_SERIES_LOCKED`, to `ERROR_CODES` in `server/utils/errors.js`. Append only.

Apply `requireFeature('inventory')` to:
every route in `inventoryRoutes.js`,
and `GET /reports/stock-consumption`.

Apply `requireFeature('attendance')` to:
every route in `attendanceRoutes.js`, including the station clock,
and `GET /reports/labour-hours`.

Put it after `authenticate` and `tenant`, and before `requireRole`, so a waiter on a switched-off feature is told it is switched off, not that they lack the role. Exception: the station clock endpoint, if it authenticates differently, gets the check wherever its tenant is known. Read how it works before placing it.

**Inventory off also stops stock movements from sales.**
Find every call into `stockMovementService.js` outside the inventory routes themselves.
Today that is `deductForFiredLines` in `kitchenService.js` and `returnStockForCancelledLine` in `orderController.js`.
When inventory is off, neither runs. Firing and cancelling still work exactly as before.
Do not move these calls or change their transactions. Wrap each in a check.

**The dashboard** returns the same shape as today, with an empty `lowStock` array when inventory is off, exactly as it already does when `lowStockAlertsEnabled` is false. If it returns any attendance figures, they come back empty or null when attendance is off. Do not remove keys.

Switching a feature back on does not back-fill anything.
Stock levels resume from where they stopped, so they will be wrong until someone does a stock count.
The settings screen says so.

### D2. On the client

1. Read `features` from `GET /auth/me` wherever the signed-in user is read.
2. Hide every link, tile and report tab that leads to inventory screens when inventory is off, and every one for attendance when attendance is off. Find them with a search, not from memory. The audit found links in `DashboardPage.jsx`, `ReportShell.jsx` and `TodayPage.jsx`, and routes in `App.jsx`.
3. If someone opens a switched-off screen by its address, show a plain message saying the feature is switched off and who can switch it on, with a link back to the dashboard. Not a blank page, not an error box.

### D3. The settings screen

Add two sections to `SettingsPage.jsx`, owner only for editing, as the page already works.

**Features.** Two switches.
Under the inventory switch: "When off, firing an order does not deduct stock. Switching it back on does not catch up, so do a stock count first."

**Invoice numbers.**
The mode as two choices: "Financial year, like 2026-27/000148" and "Prefix, like CFA/C/22442".
Prefix and starting number fields, shown only for the prefix mode.
A preview line showing the next bill number exactly as it will print.
A warning above the save button: "Invoice numbers are a legal record. Change this only before the first bill of a new series, and only after your accountant agrees."
Show the server's error message when a rule in C3 refuses the change.

The settings `PATCH` already requires a `reason`. The screen asks for it, as it does today.

---

## 9. Permissions

| Endpoint | Change |
|---|---|
| `GET /settings` | Unchanged: OWNER, MANAGER |
| `PATCH /settings` | Unchanged: OWNER only. Now also sets features and the invoice series. |
| `GET /auth/me` | Unchanged roles. Adds `features`. |
| Inventory routes, attendance routes, the two reports | Roles unchanged. Now also refused for everyone when the feature is off. |

---

## 10. Tests

Add to the existing settings, bills, inventory, attendance and auth test files, or new files where that reads better.

**Settings**
1. A restaurant created before this change reads back both new groups with their defaults.
2. Every row in C2: the right status and code.
3. Each of the three rules in C3, refused with its code and message, and the allowed case beside each one.
4. A change to `features.inventory` writes one `SETTINGS_CHANGED` audit line with the right field path.

**Bill numbers**
5. Default mode: the first bill is `2026-27/000001` style, exactly as the existing tests expect.
6. Prefix mode with `CFA/C/` and starting number 22442: the first three bills are `CFA/C/22442`, `CFA/C/22443`, `CFA/C/22444`, with `billSequence` 22442 to 22444 and `invoiceSeries` `CFA/C/`.
7. Two bills created at the same moment in prefix mode get two different consecutive numbers. Use the same concurrency approach the existing bill number tests use.
8. A voided bill in prefix mode keeps its number, and the next bill takes the next number.
9. A bill near midnight on 31 March in prefix mode, and one just after: the numbers continue without resetting, and `financialYear` differs between them.
10. A new prefix with a starting number at or below the highest sequence used this year is refused, and no bill creation is ever attempted with it.

**Feature switches**
11. Inventory off: every inventory route and the stock report return 403 `FEATURE_DISABLED` for an OWNER.
12. Attendance off: every attendance route and the labour report return 403 `FEATURE_DISABLED`.
13. Inventory off: firing an order with a recipe-mapped item writes no `stockmovements` document. Cancelling a fired line writes none either.
14. Inventory on: the same two actions write their movements exactly as before.
15. Inventory off: the dashboard still returns 200 with an empty `lowStock`.
16. `GET /auth/me` returns `features` for a WAITER and a KITCHEN user.

Run the full suite at the end. Every test that passed before must still pass.

---

## 11. Non-negotiable rules that apply

"Bill numbers are generated on the server, are sequential, and are never reused."
"GST rates are settings, never hardcoded." The invoice series follows the same idea: a legal choice an owner makes, stored as a setting.
"Check permissions on the server for every endpoint. Hiding a button in React is not security." The feature switch is enforced by `requireFeature` on the server. Hiding links in React is only for tidiness.
"Never hard delete a bill, order, or stock entry." Switching inventory off stops new movements. It never deletes old ones.
"Schema changes are additive: new fields with defaults, nothing renamed or removed."

## 12. Golden day

The golden day in `docs/TEST-DATA.md` uses prefix `CFA/C/` and starting number 22442, so B01 is `CFA/C/22442` and B16 is `CFA/C/22457`.
After this prompt, that numbering is possible. Test 6 above proves its first three bills.

---

## 13. Docs to update

1. `docs/CAFFEZA-PROFILE.md` section 1: the legal name row says it lives in `settings.receipt.headerLine1` "until a legal name field exists". `restaurants.legalName` already exists. Change the row to point at it.
2. `docs/PROJECT-STATE.md`:
   1. The date line.
   2. "Current stage": "Next: P03, bill snapshots and line shares."
   3. Decision log, dated today:
      "Inventory and attendance can be switched off per restaurant with `settings.features`. Enforced on the server by `requireFeature`. Inventory off also stops stock movements from firing and cancelling. | Caffeza launches without either, and a switched-off module must not quietly keep writing data."
      "Invoice numbering is a setting: `FINANCIAL_YEAR`, today's format, or `PREFIX`, a prefix plus a running number that never resets. Prefix up to 7 characters, number up to 9 digits. | Caffeza continues its `CFA/C/` series. The limits keep every number within the GST rule of 16 characters."
      "A new prefix series must start above the highest bill sequence used in the current financial year, a started series cannot be restarted, and switching back to financial-year numbering mid-year is refused. | All three protect the two unique indexes on bills, which would otherwise fail at the till."
      "Removed `docs/archive/PROJECT-PLAN_1.md` and `docs/PROJECT-INSTRUCTIONS.md` | Stale or duplicated elsewhere. Git history keeps both."
   4. Open questions: add "Should kitchen station logins be able to cancel items? Caffeza's stations do it today. Our rule allows OWNER, MANAGER, CASHIER and WAITER only." if P04 has not already added it.
   5. "What changed recently": add a P02 entry at the top, and move the oldest entry to the top of `docs/archive/SESSION-LOG.md`.
3. `docs/prompts/README.md`: mark P02 as Done.

---

## 14. Out of scope

The No Charge series. That is P08.
Bill snapshot fields, line shares, captain and covers on the bill. That is P03.
Wiring `tax.pricingMode` or `tax.roundOffEnabled`. Still waiting on the CA.
Removing or hiding inventory and attendance code. They are switched off, not deleted.
Any change to how order or KOT numbers work.

---

## 15. Done when

1. `npm test` passes, with before and after counts recorded.
2. `npm run lint` and `npm run build` pass.
3. Locally, with the dev server running: set prefix mode with `CFA/C/` and a starting number above your local bills, create a bill, and see `CFA/C/` and the number on the bill screen and the receipt.
4. Locally: switch inventory off, and the inventory tile and stock report tab are gone, and `/inventory` by address shows the switched-off message.
5. Every doc in section 13 is updated.
6. Commits on `main`, one line each, for example:
   `remove stale docs`
   `add m7 feature switches and invoice series spec`
   `add feature switches`
   `add prefix invoice series`
   `update docs for p02`
7. Push `main`.
8. Print a short summary: commits, files deleted, added and changed, test counts before and after, and anything that surprised you.
