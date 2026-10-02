# Session log, archived from PROJECT-STATE.md

### 2026-10-01 Rishi, P14 report engine

What was built or decided:
`server/services/reports/`: `engine.js` (`runReport` in the nine contract
steps, the filter sentence, open days, `personNames`), `labels.js` (88 glossary
terms, mirrored on the client), `params.js` (every contract filter),
`registry.js`, `exportXlsx.js` (four sheets, money in rupees with the Indian
format, the file name rule), and `definitions/bills.js`, R19 with every filter,
totals across pages and `readBillDetail` with the order's timeline. Routes:
`GET /api/v1/reports/v2/bills` and `/reports/v2/bills/:billId`; M6 routes
untouched.

`reconciliationService.js` is complete: C2, C5, C7, C10, C11, C12 added, and
`runRangeChecks` runs C1, C2, C3, C4, C6, C7, C8, C10, C11 and C12 over a range,
one result per check. Day Close runs every one-day check.

Five new indexes, each starting with `restaurantId`: payments by business
date and a series in sequence order on `bills`; cancelled lines by time,
cancelled orders by time, and No Charge orders by date on `orders`.
`npm run db:indexes` created them locally, and a second run created none.

Client: `/reports/bills` reads every filter from the address, shows the filter
sentence, open-day banner, check strip, table, paging and the totals row, and
has an Excel button; `/reports/bills/:billId` shows lines with shares and the
timeline. Shared cells, banner and strip in `features/reports/v2/`.

Every row of TEST-DATA section 6 is broken on purpose in
`tests/reportEngine.test.js` and fails exactly its own check (C3's row also
fails C4, as TEST-DATA says). The opt-in speed test, `PERF=1`, ran R19 over a
full year of 66,430 bills with its totals in 233 ms.

Checked by hand in Chrome on a local production build: a Bill List filtered by
captain opened from its address, and a bill's timeline. The Excel button was
not clicked in the browser, because that downloads a file; the workbook is
opened and checked in the test instead.

Tests: 793 before, 820 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `server/services/reports/*`, `routes/reportV2Routes.js`,
`controllers/reportV2Controller.js`, tests `reportEngine.test.js` and
`reportPerf.test.js`, client `api/reportsV2.js`, `features/reports/labels.js`,
`features/reports/v2/*`. Changed: `reconciliationService.js`, Bill and Order
models (indexes), `tests/helpers/goldenDay.js` (`addNextDay`),
`api/client.js` (`downloadFile`), `App.jsx`, server `package.json` (exceljs).

Anything the other developer needs to know:
A new report is one file in `definitions/` plus a line in `registry.js`.
Port 5000 on this machine was held by another server process during the hand
check, so the check ran on 5055.

Anything now blocked or unblocked:
P15, P16 and P17 can start.

### 2026-10-01 Rishi, P13 reports spec

What was built or decided:
The M19 contract, docs only: `docs/API-CONTRACT.md` section "M19 Reports v2".
Principles (M6's carried over by reference, plus nine M19 rules), the shared
request and its filters, the shared envelope shown filled in for R3 on the
golden day, column types, drill downs, sections, open days, the filter
sentence's exact construction, the checks per report, the Excel export, every
report R1 to R19 with its endpoint, roles, filters, columns and the stored field
each reads, examples for R2, R5, R11 and R15 from the golden day, the indexes
P14 adds, the permissions table, a new `CHECK_FAILED` code, and the fields still
not stored.

REPORT-SPEC section 6 now points at the contract, and R3, R4 and R14 name their
new paths. RECONCILIATION-RULES section 3 matches the contract. GLOSSARY gained
section 13, the column labels. CONVENTIONS gained `CHECK_FAILED`.

The four self-checks:
1. Every number in TEST-DATA section 4 has a home: R2's sections A to H carry
   all of A, B, D, E, F, G and H (`sales.*`, `money.*`, `cash.*`, `orderTypes`,
   `gst`, `controls.*`, `invoices`); the category table is R11's rows; the
   captain table is R12's rows.
2. Every column names a stored field that DB-SCHEMA has, except the names of
   people other than the captain, listed in the contract's section 11.
3. R19's filters express every drill down from every other report; cash
   lines, payouts, cancelled lines and No Charge open their own records.
4. Not stored: the name, at the time, of whoever discounted, cancelled, voided
   or approved. Not invented; shown as the current name.

Files or endpoints touched:
Docs only. No code.

Anything the other developer needs to know:
M19 paths are `/api/v1/reports/v2/{name}`. A definition never reads `users`,
`menuitems`, `categories` or `paymentmethods`; names come through the engine.

Anything now blocked or unblocked:
P14 can start.

### 2026-10-01 Rishi, P12 cloud deployment

What was built or decided:
In production `createApp` serves `client/dist` after the API routes: `/assets/`
for a year as immutable, `index.html` with `no-cache`, and `index.html` for any
other GET outside `/api/`, so reloading `/day-close` works. An unknown `/api/`
address still gets the JSON 404. A production start refuses with "The client has
not been built. Run npm run build, then start again." when the build is missing.

IBM Plex Sans (400, 500, 600) and Mono (400 to 700) now come from
`@fontsource`, imported in `main.jsx`; the Google Fonts lines are gone.
`GET /api/v1/health` gains `release`, from the new optional `RELEASE_VERSION`.
A host-neutral `Dockerfile` (Node 20 build, Node 20 slim run as the `node` user,
health check on `/api/v1/health`, no secret, no index building on start) and
`.dockerignore`. `npm run smoke -- --url <address>` makes only reading requests
and prints one line per check. `docs/DEPLOYMENT.md` sections 2 and 6 and a new
section 13 are the runbook.

Verified by hand: built the client, built indexes, and started with
`NODE_ENV=production` against a local replica set on port 5000. The smoke check
passed every line, with the https check skipped for http, and health showed the
release. In Chrome the production build showed no CSP violation, no request to
another site, both font families loaded from our own server, and a reload of
`/day-close` landed in the app. Docker is installed on this machine but its
daemon was not running, so `docker build .` was not run.

Tests: 784 before, 793 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `Dockerfile`, `.dockerignore`, `server/scripts/smokeCheck.js`,
`server/tests/production.test.js`. Changed: `server/server.js`,
`server/config/env.js`, `server/controllers/healthController.js`,
`server/tests/app.test.js` (the health field list gains `release`, on purpose),
`.env.example`, both `package.json` files and the lock file, `client/index.html`,
`client/src/main.jsx`, `client/package.json`.

Anything the other developer needs to know:
Arya brings staging up by hand from the checklist below. A coding session must
not: these need accounts, payment and judgement.
1. Choose the host, against docs/DEPLOYMENT.md section 2. It must give a fixed outbound address, or stop and decide together.
2. Create the Atlas staging cluster, docs/DEPLOYMENT.md section 3, allowing only the host's address.
3. Buy the domain and point caffeza-staging.<domain> at the host.
4. Set every environment variable from docs/DEPLOYMENT.md section 4 on the host. NODE_ENV=production, TRUST_PROXY per the host's documentation, CLIENT_ORIGIN exactly the staging address, new secrets from openssl rand -base64 48.
5. Deploy. Run npm run db:indexes against staging. Start.
6. Run npm run smoke -- --url https://caffeza-staging.<domain>. Every line must pass.
7. npm run provision:restaurant against staging for Caffeza's owner.
8. npm run setup:restaurant and npm run import:menu, dry run first, then --apply.
9. Sign in on a phone and on a laptop. Open a table, fire, bill, print, pay, close the day.
10. Set up the uptime monitor on /api/v1/health.
11. Record the host choice and these dates in docs/PROJECT-STATE.md.

Anything now blocked or unblocked:
P13 can start. Staging waits on the checklist.

### 2026-10-01 Rishi, P11 Caffeza setup and menu import

What was built or decided:
`npm run setup:restaurant` (`server/scripts/setupRestaurant.js`) sets a
restaurant up from one JSON file: profile, settings, stations, category
routing, tables, payment methods, On Hold accounts and staff logins.
`npm run import:menu` (`server/scripts/importMenu.js`) imports a menu CSV,
with sizes and an optional add-ons CSV. Both start the app in-process, sign in
as the owner with the password typed hidden, validate everything first and
list every problem, change nothing without `--apply`, match by name so a re-run
is safe, and never delete, deactivate, create a bill or set the invoice
series. `"TO CONFIRM"` values are skipped and listed; a staff member without a
phone is not created; new logins get a password printed once. Shared code is
in `server/scripts/lib/scriptApi.js`.

Caffeza's files: `setup/caffeza.json` from the profile (34 tables in Cafe,
Live Kitchen and Beverages, the nine Beverages categories, eight payment
methods with their Tally codes, both office accounts, eight staff with phones
to confirm), `setup/caffeza-menu.csv` (a partial menu of 34 items in 16
categories, marked to be replaced), and `setup/README.md`.

Verified by hand against a local replica set: a throwaway restaurant was
provisioned, the setup dry run printed create 43, update 5, skip 29, then
`--apply` did exactly that; the menu dry run printed 16 categories and 34
items, then applied; a second setup dry run reported 64 unchanged. The
database then held 34 active tables in Cafe, Italian Coffees on Beverages,
Water Bottle at 4761 paise and 8 active payment methods.

Tests: 774 before, 784 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: the two scripts, `scripts/lib/scriptApi.js`,
`tests/setupScripts.test.js`, `setup/`. Changed: both `package.json` files,
`scripts/seedDemo.js`, `docs/DEPLOYMENT.md` section 7, `docs/GO-LIVE.md`
section 4. No endpoint, model or screen changed.

Anything the other developer needs to know:
Fill in every `TO CONFIRM` in `setup/caffeza.json`, including the On Hold
opening balances, before the production run: an opening balance is set only
when an account is created. The order screen with the imported menu was not
opened in a browser; the menu and tables were checked in the database.

Anything now blocked or unblocked:
P12 can start.

### 2026-10-01 Rishi, P10 cash drawer and Day Close

What was built or decided:
The cash drawer: `cashmovements` (opening float, paid in, paid out), one live
float per business date by a partial unique index, paid out for managers with
`CASH_PAID_OUT`, voids with a reason. Every entry is dated today by the server.

`computeDayFigures` in `services/dayFiguresService.js` returns R2 sections A to
H from frozen fields only. `reconciliationService.js` has C1, C3, C4, C6, C8 and
C9 for one business date, each returning the shared result shape with the
exact wording from RECONCILIATION-RULES.

Day Close: `dayclosures`, five endpoints, blockers reported together in one
422 `DAY_NOT_READY`, a note required for a cash difference, the snapshot and
checks stored at close, the history, `DAY_CLOSED` and `DAY_REOPENED`, the
`dayClose.showCashDifferenceToManager` setting, the blind count enforced on the
server, and a server-laid-out print at 32 or 48 columns.

The lock: `assertDayOpen` in `services/dayLockService.js`, wired into bill
creation, discount, void, payment, payment correction, charge to account,
No Charge, cash movements and their voids, collections, adjustments, and
payouts and their voids.

The golden day: `tests/helpers/goldenDay.js` builds all of 26 September through
the API at the real times, and `tests/goldenDay.test.js` closes it. The stored
snapshot matches every number in TEST-DATA section 4 to the paisa, first time:
15 bills, 27 covers, item total 931022, discount 42390, net sales 888632, CGST
19131, SGST 19126, GST 38257, round-off 11, bill total 926900, average bill
59242, average per cover 26709, expected cash 340400, difference -400. Each of
C1, C3, C4, C6 and C8 fails exactly as TEST-DATA section 6 says when its one
thing is broken, and C9 raises the -400 warning.

Client: a Cash drawer screen (`/cash`), a Day Close screen (`/day-close`) with
blockers linked to their order or bill, the count, a note that turns required,
figures, checks, print and the owner's reopen, a dashboard warning when
yesterday traded and was not closed, and the blind-count switch in Settings.

Tests: 749 before, 774 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: CashMovement and DayClosure models, `cashService`, `dayFiguresService`,
`reconciliationService`, `dayCloseService`, `dayLockService`, the day close
controller, routes and validators, tests `goldenDay.test.js`,
`dayClose.test.js` and `helpers/goldenDay.js`, client `api/dayClose.js`,
`CashDrawerPage.jsx`, `DayClosePage.jsx`, `UnclosedDayWarning.jsx`,
`InlineVoid.jsx`. Changed: `billService`, `accountService`, `payoutService`,
`noChargeService` (the lock), `money.js` (`averagePaise`), `receiptService`
(exports `row`), the Restaurant model, settings validators and service,
AuditLog, `errors.js`, and on the client the dashboard, settings, `App.jsx`,
`formatDate.js` and the payouts page.

Anything the other developer needs to know:
Every new write that changes a business date's figures must call
`assertDayOpen`. R2 in P15 returns `computeDayFigures`, or the stored snapshot
for a closed day; the golden day fixture and `GOLDEN_EXPECTED` are there to
reuse. Not done by hand in a browser yet: a float, a cash bill, a paid out, a
blind close as manager, the owner's view, and the printed close.

Anything now blocked or unblocked:
P11 and P13 can start.

### 2026-10-01 Rishi, P09 On Hold accounts and platform payouts

What was built or decided:
On Hold accounts: `accounts` and an append-only `accountentries` ledger, with
the balance always computed from the entries. Create (an opening balance
writes an OPENING entry in the same transaction), edit, list with outstanding
balance and oldest uncollected date, and a statement with a running balance.
`POST /bills/:id/charge-to-account` (OWNER, MANAGER) puts what is still owed on
the account in one transaction: the bill becomes ON_ACCOUNT, the order BILLED
and the table frees, a CHARGE entry and `BILL_CHARGED_TO_ACCOUNT`. Voiding an
On Hold bill writes CHARGE_REVERSED in the same transaction. Collections take
in-hand methods only and never more than is owed; owner adjustments write
`ACCOUNT_BALANCE_ADJUSTED`.

Where ON_ACCOUNT changed existing behaviour: taking a payment and applying a
discount refuse it; voiding allows it with the reversal; the bill list filters
and shows it as "On Hold"; the M6 sales figures count it as a sale like any
live bill; the M6 payments and unpaid figures do not count it, because On Hold
money is not received money and the bill is not unpaid.

Platform payouts: `platformpayouts`, list (with expected, difference and
rate-not-set payments), record (409 on an overlapping live period), void
(owner, reason, kept). Expected is each covered payment's amount at
(10000 − its frozen commission) basis points through `applyBasisPoints`, summed.

Client: Charge to account on an unpaid bill, an On Hold accounts page
(`/accounts`) with statements, collections and owner adjustments, and a
Payouts page (`/payouts`) with a negative difference in `mirch`, both under a
Money label on the dashboard.

Golden day B09 (4700 to E-210 Office), B10 (50400 to W-330 Office), the
section 5 collection at 1:15 PM on 27 September, and the Swiggy payout of
74400 against 93000 at 2000 bps, are reproduced to the paisa. C3 is checked on
a part-paid charged bill, C10 by hand, C11 in the payout test.

Tests: 730 before, 749 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: Account, AccountEntry and PlatformPayout models, `accountService`,
`payoutService`, account controller, routes and validators, tests
`accounts.test.js`, client `api/accounts.js`, `ChargeToAccountPanel.jsx`,
`features/settlement/AccountsPage.jsx` and `PayoutsPage.jsx`. Changed: Bill and
AuditLog models, `billService` (transactional void), `billPermissionService`,
`paymentMethodService` (`methodByCode`), `salesReportService`, `utils/errors.js`,
`tests/tables.test.js`, and on the client the bill screen, badge, list, labels,
dashboard, `App.jsx` and `formatDate.js` (`formatBusinessDate`).

Anything the other developer needs to know:
Write account entries only through `accountService`. The P10 closed-day
refusal points are marked with comments in `accountService` and
`payoutService`. Not done by hand in a browser yet: charging a bill and seeing
the table free, the next-day collection, and a Swiggy payout on screen.

Anything now blocked or unblocked:
P10 can start.

### 2026-10-01 Rishi, P08 payment methods, discount reasons and No Charge

What was built or decided:
A test clock: `nowUtc()` reads a replaceable clock, `setClockForTests` and
`resetClockForTests` refuse outside `NODE_ENV=test`, every business-event
`new Date()` in services and controllers now reads `nowUtc()`, and a guard test
keeps it that way. Token times are untouched.

M10: a `paymentmethods` collection. Cash, Card, UPI and an inactive Other are
created by code when missing: at provisioning, and lazily before a list or a
payment, so existing restaurants need no migration and a renamed method is never
overwritten. `GET/POST/PATCH /payment-methods`; code and kind never change.
Taking a payment checks the four rules (active, order type, a platform bill paid
only by its platform, a platform method only on its platform's bills) and
freezes the method's name, kind, Tally code, commission and the payment's own
business date. `POST /bills/:id/payments/:paymentId/correct` changes only the
method, keeps a `corrections` history and writes `PAYMENT_METHOD_CORRECTED`.

Discounts take a fixed `reasonCode` from `server/config/discountReasons.js`
(mirrored on the client), an optional note required for Other, and `fundedBy`.
The old `reason` field is refused. `settings.discounts.cashierMayApplyPlatformDiscounts`
lets a cashier give platform discounts only.

M16 No Charge: order status `NO_CHARGE` with a frozen `noCharge` record,
`POST /orders/:id/no-charge` (OWNER, MANAGER), four rules, one transaction,
`NO_CHARGE_GIVEN`, the table freed, no bill and no invoice number.

Client: payment buttons from the configured methods (a Swiggy bill shows only
Swiggy), Change payment method on a paid bill for managers, the discount panel
with reason buttons and Paid for by, a No Charge panel on the order screen, and
Payment methods and Discounts sections in Settings.

Golden day B02, B05 and B14 and N01 run through the API at their real times.
B14's payment at 12:02 AM on 27 September carries business date 2026-09-26.

Tests: 700 before, 730 after, 0 failing. Lint and build pass.

Files or endpoints touched:
New: `models/PaymentMethod.js`, `services/paymentMethodService.js`,
`services/noChargeService.js`, payment method controller, routes and
validators, `config/discountReasons.js`, `config/noChargeReasons.js`, tests
`clock.test.js` and `payments.test.js`, client `api/paymentMethods.js`,
`MethodButtons.jsx`, `CorrectPaymentPanel.jsx`, `NoChargePanel.jsx`,
`PaymentMethodsSection.jsx`. Changed: Bill, Order, Restaurant and AuditLog
models, bill service, permissions, controller, routes and validators, order
controller, routes and validators, `authController` (`discounts` on
`/auth/me`), `receiptService`, `salesReportService`, provisioning,
`seedDemo.js`, `utils/time.js`.
Part of this work was committed mid-session as `be63016`.

Anything the other developer needs to know:
Call `nowUtc()`, never `new Date()`, in a service or controller. A payment's
`methodKind` null reads as IN_HAND and a null `businessDate` as the bill's.
The closed-day refusal points for P10 are marked with comments in
`billService.recordPayment`, `billService.correctPayment` and
`noChargeService.giveNoCharge`.
Not done by hand in a browser yet: adding Zomato Gold, a Zomato Gold discount
and payment corrected to UPI, and No Charge freeing a table on screen.

Anything now blocked or unblocked:
P09 and P11 can start.

### 2026-10-01 Rishi, P07 settlement spec

What was built or decided:
The spec for payments, No Charge, On Hold accounts, platform payouts, the cash
drawer and Day Close. Docs only: no code, no model, no test.

`docs/API-CONTRACT.md` gains "M10 Payments" (payment methods, taking and
correcting a payment, discount reasons), "M16 Settlement and Day Close" (No
Charge, accounts, the cash drawer, `computeDayFigures` sections A to H, the
checks at close, Day Close with the blind count, and the `assertDayOpen` lock
list), M17 section 6 for platform payouts, the `discounts` and `dayClose`
settings groups, and eight new M8 actions with four entity types.

`docs/DB-SCHEMA.md` gains sections 20 to 25: `paymentmethods`, `accounts`,
`accountentries`, `platformpayouts`, `cashmovements`, `dayclosures`. Orders gain
`NO_CHARGE` and `noCharge`; bills gain `ON_ACCOUNT` and the account charge
fields; payments gain frozen method fields, a business date and corrections;
the discount gains `reasonCode` and `fundedBy`. Every field is additive with a
default, and every new index starts with `restaurantId`.

GLOSSARY, REPORT-SPEC, RECONCILIATION-RULES, CONVENTIONS (five error codes) and
the build plan (P08 and P09 renamed, `PLATFORM_PAYOUT_RECORDED` now entity
`PAYOUT` from P09) were brought in line.

Files or endpoints touched:
Docs only.

Anything the other developer needs to know:
Every write that changes a business date's figures calls `assertDayOpen` once;
the list is in the M16 section 7. Readers treat a null `methodKind` on an old
payment as `IN_HAND` and a null payment `businessDate` as the bill's.

Anything now blocked or unblocked:
P08 can start.

### 2026-10-01 Rishi, P06 delivery and platform orders

What was built or decided:
M17's first part. `DELIVERY` order type with `platform: { code, name, orderId }`
from `server/config/platforms.js` (Zomato, Swiggy; mirrored on the client) and
`taxTreatment`. A delivery order has no table and no guests; a platform order
number can be live on only one order, enforced by a partial unique index, and a
second entry is a 409 naming the existing order. With
`settings.delivery.platformCollectsGst` on (the default), lines are frozen at
0% with the item's rate kept in `menuTaxRateBps`; the order keeps its treatment
for lines added later even if the setting changes. Bills copy `platform` and
`taxTreatment`. The KOT ticket shows `DELIVERY  SWIGGY {number}`.

A latent M2 bug was fixed on the way: two open orders with no table collided on
the one-order-per-table index, so a second takeaway or delivery order was
refused while the first was open. Only an order with a table occupies one now.

Golden day B07 (93000 at 0%) and B08 (30500, shares 13069 and 6931) are
reproduced through the API in `tests/delivery.test.js`.

Client: a Delivery page at `/orders/delivery` (platform buttons, order number,
keyboard-friendly, link to the existing order on a duplicate), a Delivery button
on the floor, and `placeLabel()` naming the order or bill as "Swiggy 2493..."
on the order screen, bill screen and bills list.

Tests: 679 before, 700 after, 0 failing.

Files or endpoints touched:
New: `config/platforms.js`, `tests/delivery.test.js`, client
`features/orders/platforms.js`, `DeliveryOrderPage.jsx`, `orderLabel.js`.
Changed: Order, Bill and Restaurant models, `orderValidators`,
`settingsValidators`, `settingsService`, `orderService.buildLineSnapshots`,
`orderController`, `billService`, `kotTicketService`, `utils/errors.js`.

Anything the other developer needs to know:
The M6 sales summary still counts only dine-in and takeaway in its per-type
fields; delivery bills are in its totals. R2 and R3 handle order types properly
in P10 and P15. Arya's read of M3 was meant to come before P06 and has not
happened.

Anything now blocked or unblocked:
P07 can start.

### 2026-10-01 Rishi, P05 kitchen stations and printing

What was built or decided:
M18 Kitchen Stations. A `stations` collection, `stationId` on categories, KOTs
(with `stationName`) and KITCHEN users. Firing routes each pending line through
its frozen `categoryId` to that category's current station, makes one KOT per
station in station order, and points each order line at the KOT it went on.
Unroutable lines go to the first active station. With no stations, one KOT with
no station, exactly as before. Stock is still deducted once per line.

`GET /kots?stationId=` (or `none`), and `GET /kots/:id/ticket?width=&reprint=`,
laid out in `services/kotTicketService.js`, a sibling of the receipt sharing its
wrapping. No prices on a ticket.

Client: `features/printing/` prints any server text through a hidden iframe at
58 or 80 mm. A "This device" page (`/device`) holds paper width and KOT
auto-print in localStorage. The bill screen's print button uses it. The kitchen
screen has a station picker (opens on the user's station, remembered on the
device), shows the station on each ticket, has Reprint, and auto-prints new
tickets once, remembering the last 500 printed ids and marking what is already on
screen as printed when auto-print is switched on. A failed print shows "Not
printed". Stations page at `/stations`; station pickers on the category rail and
the staff form for KITCHEN users.

Tests: 660 before, 679 after, 0 failing. Ticket snapshots at 32 and 48 in
`tests/stations.test.js`.

Files or endpoints touched:
New: `models/Station.js`, `services/stationService.js`,
`services/kotTicketService.js`, `controllers/stationController.js`,
`routes/stationRoutes.js`, `validators/stationValidators.js`,
`tests/stations.test.js`, client `features/printing/*`, `features/stations/*`,
`api/stations.js`. Changed: Category, Kot, User models, `kitchenService.fireOrder`,
`kotController`, category and user controllers and validators, `authController`
(`user.stationId` on `/auth/me`), `receiptService` (exports its wrapping),
`utils/time.js` (`formatTimeIst12`), and on the client the kitchen screen, bill
screen, menu builder, staff form, dashboard, settings and `App.jsx`.
`features/billing/printReceipt.js` is replaced by `features/printing/printText.js`.

Anything the other developer needs to know:
Not checked by hand in a browser with a real printer yet: the two-station
fire, the print preview width, and auto-print after a refresh. A 48-wide ticket
as the API returns it is in the P05 summary of this session.

Anything now blocked or unblocked:
P06 can start.

### 2026-10-01 Rishi, P04 cancel reasons and the variant check

What was built or decided:
Cancelling an item, cancelling an order and voiding a bill now take a fixed
`reasonCode` plus an optional `note`, required for `OTHER`. The three lists live
in `server/config/cancelReasons.js` and are mirrored, codes and labels only, in
`client/src/features/orders/cancelReasons.js`; a test keeps the two identical.
The old `reason` field is refused with a 400. The stored text fields
(`cancelReason`, `voidReason`) now hold the note; new `cancelReasonCode` and
`voidReasonCode` fields hold the code. Old records are not converted.

A line cancelled with `wasPrepared: true` writes `LINE_CANCELLED_AFTER_PREP`.
Every whole-order cancel writes `ORDER_CANCELLED`, which was listed since M3 and
never written. Both are written inside the cancel's transaction, so a version
conflict leaves no audit line. `BILL_VOIDED` now carries `reasonCode` in
`details` and "label: note" as its reason.

An unavailable variant or add-on is refused with a 422 when ordered. The menu
already carried `isAvailable` on both, so no contract change was needed there.
The order screen greys them out with "Out of stock".

On screen: one large button per reason in the cancel and void panels (a shared
`ReasonPicker`), the note under them, and the label plus note shown on a
cancelled line and a voided bill.

Golden day B13 is built through the API in a test: the bill is ₹420.00, with
exactly one after-preparation audit line for ₹390.00.

Files or endpoints touched:
New: `server/config/cancelReasons.js`, `client/src/features/orders/cancelReasons.js`,
`client/src/features/orders/ReasonPicker.jsx`, `server/tests/cancelReasons.test.js`.
Changed: `validators/common.js` (`reasonFields`, `requireNoteForOther`),
`orderValidators.js`, `billValidators.js`, `models/Order.js`, `models/Bill.js`,
`models/AuditLog.js`, `controllers/orderController.js`, `services/billService.js`,
`services/orderService.js`, `scripts/seedDemo.js`, and on the client
`api/orders.js`, `api/bills.js`, `CancelPanel.jsx`, `OrderScreenPage.jsx`,
`OrderLineList.jsx`, `LineOptionsPanel.jsx`, `VoidBillPanel.jsx`,
`BillScreenPage.jsx`. Existing tests that sent `reason` now send
`reasonCode: 'OTHER'` with the old text as the note.
Endpoints: the request shape of `POST /orders/:id/lines/:lineId/cancel`,
`POST /orders/:id/cancel` and `POST /bills/:id/void`.

Anything the other developer needs to know:
A whole-order cancel stores its code on the order only; the lines it cancels get
the note and a null line code, because the two lists differ. R15 should read the
order's code for those lines. The variant check and the reason codes landed in
one commit, not two.

Anything now blocked or unblocked:
P05 can start. Kitchen cancelling is an open question, deliberately unchanged.

### 2026-10-01 Rishi, P03 bill snapshots and line shares

What was built or decided:
Order lines now freeze `categoryId` and `categoryName` when added. Bills freeze
`captainId`, `captainName` ("Unknown" if the user is gone), `guestCount` and
`orderOpenedAt`. Every bill line stores `discountShareInPaise`,
`taxableInPaise` and `taxInPaise`.

`largestRemainderSplit` and `allocateLineShares` are new in `server/utils/tax.js`.
BigInt throughout. The split works inside each tax rate and checks C2 itself
before returning, throwing if the shares do not add up. `computeBillTotals` is
untouched. `applyTotals` in `billService.js` now writes the shares, so creating
a bill and discounting one use the same code.

Tests reproduce every table in `docs/TEST-DATA.md` section 3 (B01, B02, B05,
B08, B14, B16) to the paisa, and B02 again through the real API: the stored
shares are 2268/2016/1411/403×4 and GST 2137/1899/1329/380×4, total ₹1,446.00,
matching Caffeza bill C22276. A property test runs 2,000 seeded random bills
(seed 20261001) and checks C1 and C2 on every one.

Files or endpoints touched:
`server/utils/tax.js`, `models/Order.js`, `models/Bill.js`,
`services/orderService.js`, `services/billService.js`; tests in `tax.test.js`,
`bills.test.js`, `orders.test.js`. No new endpoint. Responses gain the new
fields; the strict request schemas still refuse them.

Anything the other developer needs to know:
Old bills have null shares and null categories, read as "not recorded". Nothing
is back-filled; rerun `npm run seed:demo` to get demo bills with shares. There is
no remove-discount endpoint, so test 11's "removing a discount" case does not
apply.

Anything now blocked or unblocked:
The M19 reports have frozen values to add up.

### 2026-10-01 Rishi, P02 feature switches and invoice series

What was built or decided:
Deleted `docs/archive/PROJECT-PLAN_1.md` and `docs/PROJECT-INSTRUCTIONS.md`.

`settings.features` (`inventory`, `attendance`, both default true) and
`settings.invoice` (`mode`, `prefix`, `startingNumber`) on M7. Every inventory
route, every attendance route including the station clock, and the two matching
reports run `requireFeature` after `tenant` and before `requireRole`, and refuse
with 403 `FEATURE_DISABLED`. With inventory off, firing and cancelling skip the
two stock-movement calls; nothing else about them changes. The dashboard keeps
its shape: `lowStock` is `[]` and `staffOnShift` is `null`. `GET /auth/me` gains
`features` for every role.

`PREFIX` mode numbers bills `CFA/C/22442` onwards, never resetting, through a
`PREFIX:<prefix>` counter created at `startingNumber - 1` inside the bill
transaction. Every bill now has `invoiceSeries`. The three rules
(`INVOICE_START_TOO_LOW`, `INVOICE_SERIES_STARTED`, `INVOICE_SERIES_LOCKED`) run
in `settingsService` before the write.

On screen: links, tiles and report tabs for a switched-off module are hidden; a
switched-off screen opened by its address says so, with a link back. The
settings page gained Features and Invoice numbers sections, a preview line and
the accountant warning.

Files or endpoints touched:
New: `middleware/requireFeature.js`, `components/RequireFeature.jsx`, tests
`featureSwitches.test.js` and `invoiceSeries.test.js`.
Changed: `models/Restaurant.js`, `models/Bill.js`, `services/settingsService.js`,
`services/billNumberService.js`, `services/billService.js`,
`services/kitchenService.js`, `services/operationsReportService.js`,
`controllers/orderController.js`, `controllers/authController.js`,
`validators/settingsValidators.js`, `utils/errors.js`, the inventory, attendance
and report routes; on the client `AuthContext.jsx`, `App.jsx`, `DashboardPage.jsx`,
`ReportShell.jsx`, `TodayPage.jsx`, `SettingsPage.jsx`, `api/settings.js`.
Docs: API-CONTRACT M7 and 14, DB-SCHEMA 11, 12 and 17, CONVENTIONS 3,
CAFFEZA-PROFILE section 1 now points the legal name at `restaurants.legalName`.

Anything the other developer needs to know:
`settingsService.getSettings(id, { session })` reads fresh inside a transaction;
`isFeatureOn(req, name)` is the one way to ask about a switch. The settings
screen preview is exact only for a new prefix series; for a running series it
describes the format, because the next number needs a counter read and there is
no endpoint for it.

Anything now blocked or unblocked:
P03 can start. P11 switches both features off and sets `CFA/C/` for Caffeza.

Run together for all three prompts, at the user's request, with one test run
at the end rather than one per prompt:
Tests: 578 passing before (P01's recorded count, not re-run first), 660 after,
0 failing. `npm run lint` and `npm run build` pass. This machine had no
`node_modules`, no root `.env` and no `server/.env.test`, so the suite ran after
`npm ci` with a throwaway env file outside the repo. No env file was added to the
repo.
Not done: the local manual checks in each prompt's "Done when" (a prefix bill
on screen and on the receipt, the switched-off screens in a browser,
`npm run seed:demo` and a discounted bill, the phone-sized cancel and void
flows). They need a running dev server and database.

### 2026-10-01 Arya, P01 production safety

What was built or decided:
The existing code is now safe on a fresh production database behind a cloud
host's proxy. No endpoint, model, schema or validator changed.

Indexes: `server/models/index.js` lists all 16 models, and a test fails if a
model file is left off it. `services/indexService.js` finds missing and extra
indexes with `Model.diffIndexes()` (checked against the installed Mongoose
8.24.4 first) and builds missing ones one at a time with `createIndexes`. It
never drops anything. `npm run db:indexes` runs it and exits 1 on any failure.
In production, `startServer()` logs every missing index and exits until the
script has been run. There is no flag that skips it.

`TRUST_PROXY`: parsed by `config/trustProxy.js` into false, a hop count from 1
to 10, or a list of addresses. `true` is refused with a sentence saying why.
Required in production, even if only `false`. `app.set('trust proxy', ...)`
reads it, and startup logs it in plain words.

Time: the kitchen screen formats fire time through `formatTimeIst`. The hourly
report reads `config.DISPLAY_TIMEZONE`. The bills list and the attendance
register default to today's business date through `businessDateToday()`, a
mirror of `businessDateFor` in `client/src/utils/formatDate.js`, tested to agree
with the server. `lastNDays` now uses the same mirror, and its output was
checked to be identical to the old version. `todayIso` is gone.

`client/vite.config.js` builds without a `.env` and without `CLIENT_ORIGIN`.

The seed script was not changed. It already refuses in production before
connecting, and that was confirmed.

Verified live, not only by tests, against a throwaway local MongoDB: a
production boot on an empty database refused with 82 missing indexes;
`db:indexes` in production mode created all 82; the server then booted and
listened; a second `db:indexes` run created nothing.

Tests: 551 passing before, 578 after, 0 failing either time. The two
"no hardcoded time zone" tests were broken on purpose by putting the old bugs
back, and each failed.

Files or endpoints touched:
New: `server/models/index.js`, `server/services/indexService.js`,
`server/scripts/buildIndexes.js`, `server/config/trustProxy.js`, tests
`indexes.test.js`, `trustProxy.test.js`, `timeDisplay.test.js`.
Changed: `server/server.js`, `server/config/env.js`,
`server/services/salesReportService.js`, `server/tests/app.test.js`, both
`package.json` files, `.env.example`, `client/vite.config.js`,
`client/src/utils/formatDate.js`, `KitchenDisplayPage.jsx`,
`BillsListPage.jsx`, `AttendanceRegisterPage.jsx`, `ReportShell.jsx`.

Anything the other developer needs to know:
Add `TRUST_PROXY=` to your own `.env` if you want it explicit; absent means
false outside production. Every deploy runs `npm run db:indexes` before
starting the server. A new model file goes into `server/models/index.js` or the
suite fails. `npm test` needs a root `.env` with real-looking secrets, as well as
`server/.env.test`: a fresh clone without one fails 18 test files at the
environment check, not in the code.

Anything now blocked or unblocked:
P02 can start. P12 (deployment) now has a deploy step to run and an
environment variable to set.

### 2026-09-30 Arya, P00 adopt the Caffeza docs

What was built or decided:
The Caffeza plan was adopted. New docs: CURRENT-STATE-AUDIT, CAFFEZA-PROFILE,
GLOSSARY, REPORT-SPEC, RECONCILIATION-RULES, TEST-DATA, CAFFEZA-BUILD-PLAN,
DEPLOYMENT, GO-LIVE, PROJECT-INSTRUCTIONS, and docs/prompts/. CLAUDE.md was
replaced. The decisions are in the decision log under 2026-09-28 and 2026-09-30.

Files or endpoints touched:
Docs only. No code, no endpoint, no model.

Anything the other developer needs to know:
Read docs/CAFFEZA-BUILD-PLAN.md first. New modules start at M16. Owners are
suggested in its section 3, change any you disagree with and log it.
CLAUDE.md now loads only the short docs; the long specs are read on demand.

Anything now blocked or unblocked:
P01 production safety can start.

### 2026-08-31 Rishi, M7 Restaurant Settings

**What was built:** M7, server and screen, on `feat/m7/restaurant-settings`.
Two endpoints, no new collection, 27 new tests. The first Phase 1B module, and
the one BUILD-PLAN says to build early because settings get more expensive to
retrofit with every module stacked on top.

**Spec first, then code.** `docs/API-CONTRACT.md` section M7 and
`docs/DB-SCHEMA.md` sections 17 and 18 were written and committed before any
M7 code existed, which is BUILD-PLAN section 13's first condition of done. The
same order M1, M5, M3, M4 and M6 used and the one M2 broke.

**Endpoints, two, both under `/api/v1`**

`GET /settings`, OWNER and MANAGER. `PATCH /settings`, OWNER only. The write is
narrower than the read on purpose: this object holds the GST pricing mode,
which is legally significant, and the business day boundary, which silently
moves which day every future sale lands on.

**No migration, and that was verified rather than assumed**

`restaurants.settings` gained `tax`, `receipt` and `inventory`. Every field has
a schema default, so a document written before M7 reads back a complete
settings object because Mongoose fills missing paths on hydration. That was
checked against a raw pre-M7 document before anything was built on top of it,
and again live: the demo restaurant on Atlas genuinely predates M7 and answered
`GET /settings` in full, with its stored `businessDayStartsAtMinutes` intact and
every new group defaulted. There is a test that strips a document back to one
key and asserts the same thing.

**`settingsService` is now the only way any module reads configuration**

Three controllers were reading `restaurant.settings.businessDayStartsAtMinutes`
directly, each with its own query and its own fallback. All three now go through
`settingsService`, so a setting that moves moves in one file.

Two services, `billService.js` and `operationsReportService.js`, still read it
directly. That was left deliberately: they are M3 and M6 code, the reads are
correct, and this module had no mandate to touch M3's file. It is in the known
problems table so the next person finds it rather than discovering it.

The cache is per-request and attached to the request, never process-level with a
time to live. BUILD-PLAN section 12 names the stale-settings cache as its own
problem: an owner changes the business day, sees nothing happen, changes it
again, and two servers now disagree about which day a sale belongs to.

**Wired now, two things, both one-line reads**

`tax.defaultTaxRateBps` fills in `taxRateBps` when `POST /menu-items` omits it.
Only the API's default moved: the field stays required in the schema and on
every stored document, an explicit rate always wins including an explicit zero,
and changing the setting tomorrow moves nothing that already exists.

`inventory.lowStockAlertsEnabled`, when false, empties the low-stock read and
the dashboard's `lowStock` array. The quantities are untouched and the plain
stock list still shows them; only the surfacing is switched off.

**Stored and deliberately not wired**

`tax.pricingMode` and `tax.roundOffEnabled`, both in the decision log above.
`settings.receipt.*` likewise, until Phase 2 printing exists. The receipt header
cap of 40 characters is enforced now, at data entry, because an 80mm roll fits
about 42 and BUILD-PLAN calls the printer problem out by name.

**A data-loss path M7 would otherwise have created**

`PATCH /restaurant` accepts `settings` and wrote it with a whole-object `$set`.
Harmless with one key, and the schema's own comment said as much. With four
groups on it, an owner moving their business day through that endpoint would
have silently reset their tax rate and wiped their receipt text. Reproduced
against a real document, then fixed by writing dotted paths, with a test. This
is a change to M0 code beyond what the M7 brief listed as allowed, and it is
called out here rather than buried because of that.

**Files created**

Server: `services/settingsService.js`, `controllers/settingsController.js`,
`routes/settingsRoutes.js`, `validators/settingsValidators.js`,
`tests/settings.test.js`.

Client: `api/settings.js`, `features/settings/` with `SettingsPage`,
`errorCopy.js` and `timeOfDay.js`.

**Changed elsewhere**

`models/Restaurant.js` (three nested settings objects, and the comment saying
why `businessDayStartsAtMinutes` never moves), `models/AuditLog.js` (two
appended enum values), `controllers/attendanceController.js`,
`controllers/billController.js`, `controllers/reportController.js` (all three
now read through `settingsService`), `controllers/menuItemController.js` and
`validators/menuValidators.js` (the default tax rate),
`services/ingredientService.js` and `services/operationsReportService.js` (the
low-stock toggle), `controllers/restaurantController.js` (the dotted-path fix),
`routes/index.js`, `App.jsx`, `DashboardPage.jsx`.

**What the other developer needs to know**

Read a setting through `settingsService`, never off `restaurant.settings`. There
is a finish check on it: `grep -rn "settings\." server/controllers/` returns
nothing that reaches into the object.

`businessDayStartsAtMinutes` is stored at the top level of `settings` and
presented under `business`. That mapping is in `settingsService` and nowhere
else. Do not tidy it.

Adding a setting is three edits: one line in `SETTING_PATHS`, one field on the
model with a default, one field in the validator. Nothing else needs to know.

`pricingMode` and `roundOffEnabled` are stored and read by nothing. Wiring them
is its own task and it needs the CA first.

**Unblocked:** M8 Audit Trail, which depends on M3 and M7 and which BUILD-PLAN
says must not run in parallel with M7 because both append to the same two
`auditlogs` enums. M7's appends are on `main` now, so M8 can start.

**Still open:** Arya has not read M7. The two services still reading settings
directly are in the known problems table.

### 2026-08-31 Rishi, M6 Reports and Dashboard

**What was built:** M6, server and screens, on `feat/m6/reports`, against the
M6 contract that was already written into `docs/API-CONTRACT.md`. Ten
read-only endpoints, no collection, 34 new tests, seven screens. This is the
seventh and last module of Phase 1.

**The spec section came first, as its own commit**, per BUILD-PLAN section 13:
`docs/DB-SCHEMA.md` gains an M6 section whose entire content is that this
module has no schema — which collection each figure is read from, which
existing indexes the reads rely on, why there is no rollup collection, and the
four things M6 must never do to data it reads.

**What M6 owns: nothing**

No model file, no field on any existing collection, no new index, and no write
verb. A test asserts `reportRoutes.js` contains no `router.post`, `patch`,
`put` or `delete`, because "M6 writes nothing" is exactly the kind of
invariant that erodes the first time storing a rollup looks convenient.

**Three rules, all negative-tested rather than assumed**

Voided records leave every total. Removing `isVoided: false` from the shared
opening `$match` fails exactly the two tests written to catch it.

An open shift contributes ZERO minutes and is listed separately. M5 refuses to
invent a clock-out time and M6 refuses identically; making an open shift
contribute elapsed-time-so-far fails exactly two more tests. This matters
beyond the report: M11 will pay people from these minutes.

Tax is summed from `bills.taxBreakdown` and never recomputed, so the report
cannot disagree with the printed bill by a rupee.

**Verified live against the seeded Atlas data, not only against the suite**

Every endpoint was driven over HTTP against Demo Restaurant A. The figures
reconcile exactly with the independent verification from the previous session:
gross sales of 128800 paise across five live bills with one voided at 18700,
CGST 3091 plus SGST 3089 making the 6180 total with CGST taking the odd paisa,
and all three GST slabs present including the zero-rated one. The two
backdated bills at 23:45 and 00:30 IST both land on business date 2026-08-29,
so the boundary holds in a report as well as on a bill. Every role gate was
checked with a real token: a manager is refused the payment breakdown, a
storekeeper gets stock consumption and nothing else, a cashier gets nothing.

**Looking at the rendered screens found two things the tests could not**

The x-axis labels were truncating to "11 A…", and the columns sat left of the
labels they belonged to. Both came from positioning SVG rects with `min()` and
`calc()` inside width attributes, which browsers support unevenly. The chart
is now plain HTML and CSS: flexbox gives geometry the browser is certain about
and centring becomes `justify-center` rather than arithmetic. No charting
library was added, and none is needed — every chart in this module is one
series of magnitudes.

**On colour**

Every M6 chart is single-series, so there is no categorical palette and the
marks are `ink`. The dataviz validator FAILs `ink` on its lightness-band and
chroma-floor checks, and both are out of scope by that validator's own footer:
they govern categorical palettes and exist to keep hues apart from each other,
which is meaningless with one series. DESIGN-SYSTEM section 3 binds instead —
`chana`, `mirch` and `patta` are functional colour, so a data mark that means
nothing in particular must use `ink` or `steel`. The check that does apply,
contrast, passes at 16.46:1. No chroma was added to satisfy a check that does
not govern this case.

**What the other developer needs to know**

`reportRangeService.js` holds the three rules every report shares: both dates
required with no defaults, the 366-day cap, and the opening `$match`. That
stage uses `scopedForAggregate`, never `scoped` — a pipeline is uncast and
`req.restaurantId` is a string, so `scoped` would return a silent zero.

`skipTenantGuard` is unchanged at four. M6 adds none, and its own tripwire test
asserts it.

**Unblocked:** Phase 1 is complete. Every module M0 to M6 has working code.

**Still open:** Arya's read, now owed on four modules. M3's two pilot gates.
Nothing in Phase 1B has been started, and BUILD-PLAN section 6 is explicit
that it should not be until the conversation with Anshul and Om happens.

### 2026-08-30 Rishi, seed data and the end-to-end Atlas verification

**What was built:** `scripts/seedDemo.js`, wired to `npm run seed:demo`, plus a
full manual verification pass against the real Atlas cluster. This is the
last piece of the M3 + M4 build; both modules are now feature-complete and
proven end to end, not just unit tested.

**The seed script**

Drives the real HTTP API -- boots the same `createApp()` the server listens
with, the way `tests/helpers/testServer.js` already does for tests -- rather
than writing documents to collections by hand, so seed data cannot
accidentally disagree with a business rule the API itself enforces.

Refuses outside `development`/`test`, and refuses any `MONGO_URI` host that
is not localhost and not explicitly named in the new `SEED_DEMO_ALLOWED_HOSTS`
env var (`.env.example` updated). Idempotent by wiping and rebuilding: two
fixed-named restaurants, "Demo Restaurant A" and "Demo Restaurant B", looked
up by name and every collection scoped to that `restaurantId` deleted before
rebuilding fresh. Verified by running it twice in a row.

What it creates, in Demo Restaurant A: all six roles with a known password,
printed once; a real Ahmedabad menu across four categories, all three GST
slabs (5%, 18%, 0% on Masala Chaas) and a 66-character dish name; two items
with variants and add-ons, one recipe attached at the variant level so the
half-plate-does-not-over-deduct case is real seeded data, not only a test;
five ingredients across all three base units, one already below its
threshold at seed time, one bought in kilograms and used in grams; six
tables; six bills covering a paid multi-slab order, a 10% discount, a voided
bill, a cancelled-after-fire line with `wasPrepared:false` (stock returns)
and one with `wasPrepared:true` (stock stands), a dish fired with no recipe
attached, and two bills backdated across the 05:00 IST business-day boundary
(23:45 and 00:30). Demo Restaurant B is minimal: one owner, one item, one
open order, existing only so a tenant-isolation check has a second restaurant
to fail against.

`api/client.js`'s `put` addition from the M4 screens session and every
endpoint built across this whole M3+M4 build are exercised by this script
firing for real.

**The verification, against the real Atlas cluster, every item on the
Section 11 checklist**

Order taken, fired, stock deducted: confirmed -- Paneer carries real
`DEDUCTION` movements with no duplicate `eventKey`s. Item cancelled after
fire answered "not made": confirmed -- two `CANCELLATION_RETURN` movements
exist, each the exact negation of the `DEDUCTION` it reverses. Bill
generated, GST correct per slab: confirmed on all six bills -- `totalTaxInPaise`
equals the sum of the slabs, every slab's CGST plus SGST equals its tax with
CGST never the smaller half, every bill reconciles
`subtotal - discount + tax + roundOff = grandTotal`, every grand total is a
whole rupee. One bill genuinely spans two slabs; the zero-rated slab appears
on another. Discount applied and audited: confirmed -- the `DISCOUNT_APPLIED`
audit row's amount and reason match the bill's own discount exactly. Payment
recorded: confirmed -- every `PAID` bill has `amountPaidInPaise` equal to its
`grandTotalInPaise`. Receipt text matches the printer width: confirmed live
over HTTP at both 32 and 48 columns against the real 66-character seeded dish
name -- every line fits, the wrap indents under itself, the amount column
stays aligned. Bill voided with a reason: confirmed, and its
`BILL_VOIDED` audit row exists. Sales total excludes it: confirmed live
against `GET /bills/summary` -- the voided bill's amount appears only in
`voidedInPaise`, never in `netInPaise` or `grossInPaise`. Bill number not
reused: confirmed -- six unique numbers, sequence 1 through 6 with no gap,
the voided bill keeping `2026-27/000004` rather than surrendering it. Stock
ledger reconciles with `currentQty`: confirmed on every one of the five
seeded ingredients, summing every movement from zero exactly matches the
cached quantity.

Two more things the checklist did not name but this build's own decisions
promised, both confirmed live: a bill at 23:45 IST and one at 00:30 IST the
same night both carry `businessDate: "2026-08-29"` under the default 05:00
boundary -- the exact business-day case BUILD-PLAN section 8 and M5 D1 exist
to get right. And `GET /inventory/unmapped` lists Gulab Jamun, fired with no
recipe attached, by name.

**What the other developer needs to know**

`npm run seed:demo` is safe to run against your own local MongoDB with no
extra configuration; running it against the shared Atlas cluster needs
`SEED_DEMO_ALLOWED_HOSTS` set explicitly in `.env`, on purpose. Demo Restaurant
A and B now live permanently on Atlas as a result of this session's own run,
logged in the known problems table so nobody mistakes them for real customer
data or wonders where they came from. Re-running the script resets them
cleanly.

**Unblocked:** nothing left in this build. M3 and M4 are both
feature-complete: server, screens, and a verified, realistic demo environment.

**Still open, and none of it closable by more code:** the CA review of the
GST output and the real-thermal-printer test, both pilot gates BUILD-PLAN
section 10 names explicitly. Arya's read, now owed on three modules instead
of two. The Atlas credential purge from git history at `177ed9c`, unrelated
to this build and still deferred from M0.

### 2026-08-30 Rishi, M4 screens

**What was built:** the three M4 screens, on `feat/m4/inventory`, on top of
the server from the previous session entry. `/inventory` (the stock list and
the adjustment panel), `/inventory/recipes` (the editor), plus a "Stock" link
on the dashboard. No server code changed.

**Screens**

The stock list: a dense list, name plus quantity in the ingredient's own
purchase unit plus a state badge, per DESIGN-SYSTEM section 6. Tapping a row
is the one tap into the adjustment panel -- there is no menu between seeing an
ingredient and acting on it.

The adjustment panel: five reason tiles (Received, Wastage, Spillage, Return,
Recount), no free-text field required, then `NumericKeypad` in the
ingredient's own purchase unit with a live base-unit conversion underneath.
Recount asks for a direction (More / Less) before the magnitude, because the
keypad itself has no sign key.

The recipe editor: a menu item list on the left, variant tabs plus an
ingredient-row editor on the right, built in a `useState` initialiser synced
once per selection -- the same fix M1's item editor already found for the
same symptom (fields empty for a frame on every selection change).

**Two shared pieces generalised, not duplicated**

`components/ui/NumericKeypad.jsx`, built during M3 screens with M4 in mind, is
reused here completely unchanged for a stock quantity.

`components/ui/StatusBadge.jsx` is new: a shared shell for any three-or-more-
state field, read by icon, colour and word together. Built once M4's stock
state (IN_STOCK/LOW/OUT) needed the exact shape M3's bill status already used;
`BillStatusBadge.jsx` is now a five-line wrapper over it rather than its own
drawing. `AvailabilityStamp` is untouched, still the two-state, rotated,
signature element DESIGN-SYSTEM section 5 reserves it as.

`client/src/utils/units.js` is new: the client-side mirror of
`server/utils/units.js`, the same relationship `formatMoney.js` has with
`money.js`. The adjustment screen has to convert a typed purchase-unit
quantity before it ever sends a request, so the BigInt algorithm exists on
both sides, kept identical on purpose.

**What the other developer needs to know**

The recipe editor is gated to OWNER and MANAGER in the client, matching the
`MenuBuilderPage` precedent, even though `GET /recipes` itself allows
STOREKEEPER on the server. `/inventory` itself is open to all six, matching
`GET /ingredients`.

`api/client.js` gained a `put` method. M4 is the first module needing one --
`PUT /recipes` is the one PUT verb in the whole project.

Lint is clean and the client builds. No automated test covers these screens;
manual verification is part of Section 11's end-to-end pass, not done yet.

**Unblocked:** M4 is feature-complete, server and screens both. Seed data and
the end-to-end Atlas verification are what remain of the whole M3+M4 build.

**Still open:** M3's two pilot gates are unchanged. Arya's read is now owed on
three modules. Seed data (`scripts/seedDemo.js`) has not been written.

### 2026-08-30 Rishi, M4 backend

**What was built:** the M4 Inventory server, on `feat/m4/inventory`, against
the spec committed on `chore/m3/pre-flight`. Eleven endpoints, three
collections, 51 new tests. 490 in the suite overall, all passing. Lint clean.
No React screens yet.

Built by Rishi. M4 is Arya's module on paper; this is the third module built
off the listed owner, after M1 and M5. Logged plainly, as the other two crossings
were, in the known problems table.

**Endpoints, eleven, all under `/api/v1`**

`POST /ingredients`, `GET /ingredients`, `PATCH /ingredients/:id`,
`PATCH /ingredients/:id/active`, `PUT /recipes`, `GET /recipes`,
`DELETE /recipes/:id`, `GET /inventory/unmapped`,
`GET /ingredients/:id/movements`, `POST /ingredients/:id/movements`,
`GET /inventory/consumption`.

**Files created**

Models: `Ingredient.js`, `Recipe.js`, `StockMovement.js`.

`utils/units.js`, before any deduction code, per CONVENTIONS 13. Cannot reuse
`money.js`'s fixed two-decimal trick because `unitsPerBase` is not always a
power of ten (a "dozen" purchase unit is 12), so every conversion goes through
BigInt, exact for any integer ratio and any decimal precision typed.

Services: `stockMovementService.js` (the ledger and its idempotency
guarantee), `recipeService.js` (the variant fallback, the one PUT, the one
hard delete, the unmapped-dishes read), `ingredientService.js` (CRUD, the
derived `stockState`, the deactivation guard, manual adjustments and their
sign).

Controllers: `ingredientController.js`, `recipeController.js`. Routes:
`inventoryRoutes.js`. Validators: `inventoryValidators.js`.

Tests: `units.test.js` (12), `stockMovements.test.js` (12),
`inventory.test.js` (39, but 12 of those were already counted -- 39 total in
that file). Also touched: `kitchenService.js` and `orderController.js` (M2
files), `utils/errors.js`, `utils/time.js`, `utils/scopedQuery.js` already had
`scopedForAggregate` from M3.

**Two real bugs found by the tests before either reached production data**

The idempotency key this module's own Phase 0 spec first proposed,
`orderLineId:type`, does not discriminate by ingredient. A recipe with more
than one ingredient -- the ordinary case -- would have its second ingredient's
movement collide with its first's on the unique index, and the idempotency
guard would read that collision as a retry and silently skip a real deduction.
Fixed to `orderLineId:ingredientId:type` before any code ran against the wrong
version; `docs/DB-SCHEMA.md` section 16 is corrected in place.

`POST /ingredients/:id/movements` was not applying the sign API-CONTRACT.md
section 18.2 promises: "the sign is applied by the server from the type, so a
storekeeper never types a minus sign." The first implementation just passed
the client's positive `qtyInBase` straight through, which meant recording
`WASTAGE` of 300 g *added* 300 g instead of removing it. Two tests written
against the correct spec text caught it immediately; fixed with a
`MANUAL_TYPE_SIGN` map in `ingredientService.adjustStock`.

**What the other developer needs to know**

Deduction happens inside `kitchenService.fireOrder`'s own transaction, right
after the order is updated to FIRED, not as a separate call anyone makes.
`orderController.js`'s single-line and whole-order cancel now call
`returnStockForCancelledLine` when `wasPrepared: false`, keyed on whether a
`DEDUCTION` movement genuinely exists for the line, not on the flag alone.

`recordMovement` in `stockMovementService.js` is the one function that touches
both `stockmovements` and `ingredients.currentQtyInBase`. It increments the
ingredient first, then claims the movement's `eventKey`; a duplicate key
undoes the increment it just made and hands back what already exists. This is
safe under real concurrency without needing a transaction, verified by firing
five genuinely concurrent calls at one `eventKey` and asserting exactly one of
them actually moved stock.

Negative stock is allowed everywhere and blocks nothing, by design (M4's
DB-SCHEMA section 14). A missing recipe deducts nothing and the sale still
succeeds; `GET /inventory/unmapped` is the honest surface for it, recomputed
against today's recipes on every read rather than remembering a flag from the
moment of firing.

`skipTenantGuard` count is unchanged: still exactly the four from M0 and
M0-D. M4 adds zero, and there is a test asserting it, the same tripwire shape
`tests/bills.test.js` already carries for M3.

**Unblocked:** M4 screens. `GET /inventory/consumption` is the read M6's
"stock consumed" report will aggregate from, the same relationship M3's bill
summary has with M6's sales report.

**Still open:** M4 has no React screens yet, and Arya's read is now owed on
three modules, not two.

### 2026-08-30 Rishi, M3 screens

**What was built:** the three M3 screens, on `feat/m3/billing`, on top of the
server from the previous session entry. `/bills/:billId`, `/bills`, and the
"Bill this order" action added to the M2 order screen. No server code changed.

**Screens**

The bill screen: lines, subtotal, discount and tax breakdown, the grand total
as the largest thing on the page, a payment panel, a discount panel
(OWNER/MANAGER), a void panel (OWNER/MANAGER), and a print action that opens
the server-rendered receipt text in a new window and calls the browser's print
dialog. Which action reads as the primary `chana` button changes with the
bill's own state: collecting payment while anything is outstanding, printing
once it is settled.

The bills list: the day's bills with the server's whole-range running total in
`meta.totals`, not a client-side sum of one page. Date range, status and
include-voided filters.

**New shared pieces**

`components/ui/NumericKeypad.jsx`: one generic on-screen digit grid for every
money and quantity entry in the product. It does no unit conversion of its
own; a caller reads the typed string back and converts it, which is what lets
M3 use it for rupees and a percentage and lets M4 reuse it unchanged for a
stock quantity. Documented in `docs/DESIGN-SYSTEM.md` section 10.1.

`BillStatusBadge.jsx`: a dedicated three-state badge for UNPAID/PAID/VOIDED,
not a third kind bolted onto `AvailabilityStamp`, which DESIGN-SYSTEM section 5
reserves as a two-state, rotated, signature element.

`features/billing/labels.js` and `Bilingual.jsx`: Gujarati-secondary labels on
the billing screen's fixed action words, the same shape as M5's Hindi-on-the-
clock-screen decision but a separate file and a separate language, considered
and logged in the decision log.

**DESIGN-SYSTEM.md gained sections 10 and 10.1 and 10.2**, appended rather than
inserted, because earlier sections are already referenced by number from code
comments across M1, M2 and M5. Covers the operator-screen redundancy rules
(icon + colour + word, a primary action that can move with the screen's state,
confirmations that state the consequence) and the keypad, so M4's screens
inherit both instead of re-deriving them.

**What the other developer needs to know**

`BillOrderButton.jsx` lives in `features/billing/`, not on
`OrderScreenPage.jsx` itself, which CONVENTIONS section 10 already flags as
near the file-length limit. It is the one place M2's order screen reaches into
M3.

Lint is clean and the client builds. No automated test covers these screens;
M3's automated coverage is the 75 server tests from the previous entry. Manual
verification against the real screens is part of Section 11's end-to-end pass,
not done yet.

**Unblocked:** M4 screens can reuse `NumericKeypad` for a stock quantity and
follow the same DESIGN-SYSTEM section 10 rules without re-deriving them.

**Still open:** M3's two pilot gates (CA review, real printer) are unchanged.
M4 backend and screens, and the seed data / end-to-end Atlas pass, are next.

### 2026-08-30 Rishi, M3 backend and the pre-flight fixes

**What was built:** the M3 Billing server, on `feat/m3/billing`, against the
spec committed first on `chore/m3/pre-flight`. Eight endpoints, two collections,
75 new tests. 427 in the suite overall, all passing. Lint clean, client builds.
No React screens yet.

**Five pre-flight fixes, before any M3 code**

The order line's `taxRateBasisPoints` was renamed to `taxRateBps`, matching M1
and DB-SCHEMA section 6, so M3 does not inherit two spellings of one quantity.
No production data exists; the four demo orders on Atlas carrying the old key
were migrated in place rather than dropped, because a teammate is actively
using that cluster.

The `skipTenantGuard` tripwire now counts call sites per file instead of
listing filenames, and was verified by adding a fifth use and watching the
suite fail. The real sanctioned count is four, not three.

Email login was audited against the three anti-enumeration guarantees the phone
path has. All three were already met; the only defect was a comment on
`models/User.js` still calling email "never a login identity", which is the
sentence that talks someone into deleting the unique index.

BUILD-PLAN section 9 gained spec-before-code as its first condition of done.

The M2 spec backfill was reviewed rather than trusted, and that found three
gaps and one code inconsistency. See the decision log.

**Endpoints, eight, all under `/api/v1`**

`POST /bills`, `GET /bills`, `GET /bills/:billId`,
`POST /bills/:billId/discount`, `POST /bills/:billId/payments`,
`POST /bills/:billId/void`, `GET /bills/summary`,
`GET /bills/:billId/receipt`.

**Files created**

Models: `Bill.js`, `AuditLog.js`. `Counter.js` gained an additive `scope` field.

Services: `billService.js`, `billPermissionService.js`, `billNumberService.js`,
`auditService.js`, `receiptService.js`. Controller: `billController.js`.
Routes: `billRoutes.js`. Validators: `billValidators.js`. Utils: `tax.js`.

Tests: `tax.test.js` (28), `billNumber.test.js` (9), `bills.test.js` (38).

**The arithmetic, which is this module's whole risk**

All of it is in `server/utils/tax.js` and nothing outside that file computes
tax. Written and tested before any controller existed, per CONVENTIONS 13.
Three tests are marked in the file as the ones that matter: per-slab rounding
really does differ from per-line (three lines of 3333 paise at 5% give 501 per
line and 500 per slab), CGST takes the odd paisa across every value 0 to 500,
and an apportioned discount puts every paisa on exactly one slab so the grand
total reconciles with its own parts.

**Three real bugs the tests found**

`Bill.aggregate` was matching a string `restaurantId` against an ObjectId, so
the bill list's running total was silently zero. An aggregation pipeline is not
cast against the schema and `req.restaurantId` comes off the JWT as a string.
Fixed with `scopedForAggregate` in `utils/scopedQuery.js`, which M6 will need
too, because that module is nothing but aggregates.

Adding `scope` to the counters index broke M2's `nextNumber` under concurrency.
MongoDB can only retry a racing upsert when the query covers every field of the
unique index, and the filter did not name `scope`. The existing M2 test caught
it.

The bill-number concurrency test passed alone and failed under the full suite,
because index creation is asynchronous and the unique index had not finished
building. That index is what makes the first bill of a financial year safe
against two concurrent upserts; without it both callers get sequence 1.

**What the other developer needs to know**

Bill creation refuses to run without a transaction. Every other write in this
project degrades gracefully on a standalone `mongod`; this one does not,
because a gap-free number sequence has no degraded mode and silently issuing
gappy numbers in development is how the pattern reaches production.

The order moves to `BILLED` when the bill is **paid**, not when it is created.
M2 decided `BILLED` frees the table, and the customers are still sitting there
until they have paid.

`billService.js` does not import the MenuItem model and must not start. A bill
copies from the order line, which copied from the menu when the line was added.

A cashier can bill and take payment but cannot discount or void. That asymmetry
is the control this module exists to sell, not an inconsistency to tidy up.

**Unblocked:** M3 screens. M4's deduction service has `wasPrepared` and the
`auditlogs` collection to build on.

**Still open:** M3 has no React screens, so it is backend-done, not done. The CA
review and the thermal printer test are pilot gates in the known problems table
and neither can be closed by code.

### 2026-08-30 Rishi, the M2 spec backfill

**What was written:** the M2 sections of `docs/API-CONTRACT.md` (sections 11 to
13, eighteen endpoints) and `docs/DB-SCHEMA.md` (sections 8 to 11, four
collections). No server or client code. This unblocks M3.

**Why it was needed**

M2 shipped and merged with no section in either spec file. M1 and M5 both wrote
their contract first and committed it before any code; M2 did not, and nobody
noticed until M3 was about to start. M3 is a function of M2's order shape — a
bill is built from an order line — so specifying M3 against undocumented code
would have been the exact guesswork CLAUDE.md forbids.

Everything in the backfill was read out of the shipped models, validators,
routes and tests. Where a claim was not obvious it was checked against the test
that proves it: the `wasPrepared` 400-versus-422 split and the `includeInactive`
parameter name were both verified this way rather than assumed.

**What M3 most needs from it**

The order line's snapshot fields are `itemName`, `unitPriceInPaise` and
`taxRateBps`. Not `priceInPaiseSnapshot`, not `taxRateBpsSnapshot`. A bill
copies from the line, and the line already copied from the menu. (The tax field
was `taxRateBasisPoints` when this entry was written and was renamed later the
same day; see the decision log.)

`orders.billId` and the `BILLED` status are reserved and untouched. M2 writes
neither.

Every order write goes through `applyVersionedUpdate` with the version in the
filter. M3 setting `BILLED` must be version-safe the same way.

`counters` has no `BILL` name on purpose. The gap-tolerant reserve-then-write
pattern is fine for order and KOT numbers and is **not** fine for bill numbers.
M3 reserves inside the transaction that inserts the bill.

**Two problems found while reading, both in the known problems table**

The order line and the menu item use different names for the same price and tax
fields. And the `skipTenantGuard` tripwire asserts on file names rather than
call counts, so the fourth production use, added inside an already-listed file
by the email-login work, slipped past it. The fourth use is legitimate; the
tripwire and the "exactly three" in the docs are both now wrong.

**Unblocked:** M3 Phase 0 can specify bills against a documented order shape.

**Still open:** M3 and M4 have no spec sections yet. That is Phase 0 and it is
the next session.

### 2026-08-30 Rishi, M5 merged to main

**What happened:** pull request #5 was merged. No code changed; this entry
records the merge and what it means for anyone starting the next module.

`main` now carries M0 (all four parts), M1, M2 and M5. 352 tests pass on `main`,
lint is clean, and the client builds. Four of the seven v1 modules are done.

**What arrived on `main` with this merge**

M5 Employee Attendance in full: the `attendanceentries` collection, eleven
endpoints, and the three React screens at `/attendance`, `/attendance/register`
and `/attendance/me`.

M0-D, which had never been on `main`: the refresh token is an httpOnly cookie
rather than a localStorage value, `/auth/refresh` and `/auth/logout` require an
`X-Requested-With` header, and `users` carries the `pinHash` credential.

Email as a second login identity, and `--email` / `--password` on the
provisioning script.

**The one thing to know if you had the old client running**

The refresh token is a cookie now and `client/src/utils/sessionStorage.js` is
deleted. A test or a script that logs in and reads `body.data.refreshToken` will
not find it; read the `Set-Cookie` header instead. Anyone with a stale dev
session should sign in again rather than debug why a restore fails.

**Merged without the second read**

BUILD-PLAN section 9 makes "the other developer has read the code" part of the
definition of done. Arya has read neither M1 nor M5. Rishi merged anyway, as a
deliberate call rather than an oversight, and the review debt is recorded in the
known problems table so it is not lost.

**Unblocked:** M6's hours-worked report has `GET /attendance/summary` on `main`
to read. M3 Billing was already unblocked by M2 and is the obvious next module.

**Still open:** Arya's read of M1 and M5. The all-roles `GET /attendance/board`
for the clock screen. The Atlas credential in git history at 177ed9c.

### 2026-08-30 Rishi, M5 pushed and merged with M2

**What happened:** no new feature work. The M5 chain was pushed to the remote for
the first time and brought up to date with the M2 module that had landed on
`main` in the meantime.

`origin/main` had moved eight commits ahead with M2 Order Taking (pull request
#4) while the M5 chain was being built locally on top of M1. The two had never
met. All five M5-era branches are now on the remote, and
`feat/m5/attendance-screens` has `origin/main` merged into it, so it is the one
branch carrying M0, M1, M2 and M5 together.

**The four merge conflicts, and how each was settled**

`server/routes/index.js` and `client/src/App.jsx`: both sides appended to a
list. Resolved as a union, M2's mounts and routes before M5's.

`server/utils/errors.js`: both sides appended error codes and error classes.
Resolved as a union; all ten classes and all four new codes
(`ALREADY_CLOCKED_IN`, `PIN_LOCKED`, `TABLE_OCCUPIED`, `VERSION_CONFLICT`)
survive, verified by importing the module.

`docs/PROJECT-STATE.md`: this file. Both sides rewrote the stage, the decision
log, the open questions and the session log. Nothing was dropped from either
decision log; both blocks are kept.

**Two open questions closed by the merge, not by new work**

The two waiters problem was answered by M2 and the business day boundary by M5
D1. Both were still listed as open on one side or the other because neither side
could see the other's answer. Both are now removed from Open Questions; the
decision rows stay in the log.

**One thing removed before the push**

The previous tip commit carried a `scratch/` folder with two ad-hoc scripts, one
of which set every user's password to a fixed string across every tenant with no
`restaurantId` filter. It was rewritten out of the commit before anything was
pushed, so it never reached the remote, and `/scratch/` is now in `.gitignore`.
The useful parts of that commit, the dashboard attendance links and a
`server.js` shutdown fix, were kept.

**Still open:** M5 is on a branch, not on `main`, and Arya still has to read both
M1 and M5.

### 2026-08-30 Rishi, M5 screens and the station clock

**What was built:** branch `feat/m5/attendance-screens`. It merges
`fix/m0/auth-hardening` into `feat/m5/attendance` (so the staff PIN and the
attendance server are in one tree), wires the last M5 endpoint, and adds the
three React screens. 255 server tests pass, lint clean, the client builds.
Not merged.

**The station clock endpoint, now wired**

`POST /attendance/station/clock` was specified in M5 and blocked on M0-D. It is
now mounted. `attendanceService.stationClock` calls `authService.verifyPin`
(which issues no token), then reuses the existing `clockIn` / `clockOut` with
`source: 'STATION'`. `action: "undo"` reverses the caller's own last station
event inside an ~8-second window: a mistaken clock-in is voided (`MIS_TAP`), a
mistaken clock-out reopens the shift with a `MIS_TAP` correction. Nine tests,
including one asserting no `RefreshToken` is created across a station clock.

**Three screens, under `client/src/features/attendance/`**

`/attendance` — the clock. Every role. A shared tablet: a grid of large name
tiles (initial disc, name, IN / OUT stamp), tap a name, enter a PIN on a numeric
pad, get a full-screen confirmation with a large UNDO that self-dismisses when
the window closes. No nav, nothing else reachable. Labels are English-primary
with Hindi underneath, from `labels.js`, both always visible (D6). The roster
and open-shift reads are OWNER/MANAGER, so the tablet needs a manager-capable
session; see the known problems table.

`/attendance/register` — OWNER, MANAGER. The day's entries as a dense list,
flagged and open shifts on top, a date range, an "Add entry" button. Correcting
or adding opens a slide-over (`CorrectionPanel`), reason required, correction
history shown on the entry.

`/attendance/me` — every role, read only. The open shift, the last seven days of
closed shifts, and the total.

**Shared code touched**

`components/ui/AvailabilityStamp.jsx` gained a `kind` prop: `availability`
(default, unchanged) or `clock` (IN / OUT). One stamp, reused, per the design
system. `utils/formatDate.js` gained `toDatetimeLocalIst` / `fromDatetimeLocalIst`
/ `todayIso` for the correction form; `utils/formatDuration.js` is new
("7h 20m"). `App.jsx` mounts the three routes.

**Contract and schema**

`docs/API-CONTRACT.md` section 8 and `docs/DB-SCHEMA.md` section 7 lost their
"not implementable until M0-D" notes; the endpoint exists now. The stale "a PIN
is unique per branch" line in DB-SCHEMA was corrected — M0-D chose no uniqueness
constraint.

**What the other developer needs to know**

The clock screen is the only screen with translated text, and it is deliberate.
Do not import `features/attendance/labels.js` anywhere else.

`AvailabilityStamp` is still one component. If M6 needs a third two-state badge,
add a `kind`, do not copy it.

The station undo window is a server constant (`STATION_UNDO_WINDOW_MS`, ~8s).
The client reads `undoUntil` off the response rather than counting locally.

**Unblocked:** M5 is feature-complete. It needs Arya's read and a merge.

**Still open:** a proper all-roles roster read for the clock screen (known
problems table). Nothing merged to `main`.

### 2026-08-29 Rishi, M5 server

**What was built:** the M5 Employee Attendance server, on branch
`feat/m5/attendance`, against the spec committed as `chore/m5/spec`. Ten
endpoints, one model, one service, 35 tests. 232 in the suite overall, all
passing. Lint clean.

**Endpoints, all under `/api/v1`**

`POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/me`
(all six roles, act on the caller).

`GET /attendance`, `GET /users/:userId/attendance`, `POST /attendance`,
`PATCH /attendance/:entryId`, `PATCH /attendance/:entryId/void`,
`GET /attendance/summary` (OWNER and MANAGER).

**Not built: the station endpoint.** `POST /attendance/station/clock` is in the
contract (section 8) but the route is not mounted. It needs `users.pinHash`,
which M0-D owns. `attendanceService.clockIn` / `clockOut` take a `source`
argument so the station path is a thin addition once M0-D ships.

**Files created**

`models/AttendanceEntry.js`, `services/attendanceService.js`,
`controllers/attendanceController.js`, `routes/attendanceRoutes.js`,
`validators/attendanceValidators.js`, `tests/attendance.test.js`.

**Changed in M0 and M1**

`utils/time.js`: the business-day placeholder is replaced by `businessDateFor`
(instant plus a per-restaurant boundary to a `"YYYY-MM-DD"` day) and
`minutesBetween` (whole minutes, seconds dropped).

`utils/errors.js`: five M5 codes and classes appended. No existing class
touched.

`validators/common.js`: `queryBoolean` now lives here; `menuValidators.js`
imports it instead of holding its own copy.

`models/Restaurant.js` and `validators/restaurantValidators.js`: `settings`
subdocument with `businessDayStartsAtMinutes` (integer 0 to 1439, default 300).
`PATCH /restaurant` accepts it, OWNER only. `GET /restaurant` returns it.

`routes/index.js`: mounts `attendanceRoutes`.

`tests/menu.test.js`: the `skipTenantGuard` tripwire comment now names M5. The
assertion is unchanged and still green: M5 added no new use, and the scan
already covered the whole `server/` tree.

**The arithmetic, which is this module's money-and-GST**

`workedMinutes = floor((clockOutAt - clockInAt) / 60000)`, recomputed on every
write, never accepted from a client. Tests cover a shift crossing midnight and a
shift crossing the configured business-day boundary, including the same shift
landing on two different `businessDate`s when the boundary is moved from 05:00
to midnight.

**One open shift per person** is a partial unique index on `clockOutAt: null`.
`mongodb-memory-server` accepts the `unique` + `partialFilterExpression: {
clockOutAt: null }` combination; a test fires two clock-ins in parallel and
asserts exactly one wins and the database holds one open entry.

**What the other developer needs to know**

Every attendance rule is in `services/attendanceService.js`. 403 means not you
(wrong role), 422 means not this by anyone: `SELF_CORRECTION_FORBIDDEN` binds an
owner. A MANAGER *may* correct an OWNER's attendance entry, unlike the M0-C user
endpoints, because it is operational data and every change is on the trail.

`businessDate` is derived once at clock-in and never recomputed. To move an
entry to another day, void it and recreate it.

`skipTenantGuard` count is unchanged: still exactly the three from M0. Every
attendance query is `scoped(req)` or an explicit `{ restaurantId, branchId }`.

**Unblocked:** M5 client screens (Task D) have an API to call. M6's
hours-worked report has `GET /attendance/summary` to read when M6 is built.

**Still open:** M5 has no React screens. The station endpoint waits on M0-D. The
Atlas credential is still unrotated.

### 2026-08-29 Rishi, M5 spec

**What was written:** the M5 Employee Attendance sections of
`docs/DB-SCHEMA.md` (section 7, `attendanceentries`) and `docs/API-CONTRACT.md`
(sections 7 to 10), plus the seven decisions that had to be settled first. No
server or client code. Committed as `chore/m5/spec`, following the M1 precedent
of a spec commit before any module code.

**The seven decisions, now in the decision log**

D1 business day boundary. `restaurants.settings.businessDayStartsAtMinutes`,
default 300 (05:00 IST), per restaurant, editable through `PATCH /restaurant`.
Every attendance entry stores a `businessDate` derived at clock-in. This closes
an open question that had been sitting since M0.

D2 shared-tablet clock-in. Yes, via a per-user PIN that is a second credential on
`users`, never a second user, and never issues a session. Delivered by M0-D
(Task C). The M5 spec defines `POST /attendance/station/clock` as the only
endpoint a PIN can reach.

D3 corrections. Embedded on the entry as `corrections[]`. No shared audit
collection is built speculatively; M3 owns that call.

D4 self-correction. Nobody edits or voids their own entry, including an OWNER.
422 `SELF_CORRECTION_FORBIDDEN`.

D5 forgotten clock-out. Never auto-closed. Flagged `requiresAttention` past 12
hours, closed by a manager correction with a reason.

D6 clock-screen language. English primary, Hindi secondary, one hardcoded label
file, no i18n layer.

D7 Swiss design. Principles inside the existing `DESIGN-SYSTEM.md` tokens, no new
palette or typeface.

**Decisions made in the writing, also logged**

`businessDate` is a `"YYYY-MM-DD"` string. "One open shift per person" is a
partial unique index on `clockOutAt: null`. A `MANAGER` may correct an `OWNER`'s
attendance entry, unlike M0-C user management, because it is operational and
audited. `PIN_LOCKED` reuses 429. One person's history is a path,
`GET /users/:userId/attendance`, not a `?userId=` query.

**Changed in M0**

`docs/DB-SCHEMA.md` section 1: `restaurants` gains
`settings.businessDayStartsAtMinutes`. The "deliberately not here" note about a
business-day field is replaced, since it is now decided. `settings.tax` is still
flagged as M3's.

`docs/API-CONTRACT.md` sections 2.1 and 2.2: the `settings` object is readable on
`GET /restaurant` and writable on `PATCH /restaurant` (OWNER only), range 0 to
1439.

`docs/API-CONTRACT.md` "Open questions still unanswered": the business-day and
staff-PIN entries are marked resolved, with pointers to the decision log.

**What Task B needs to know**

The specs are the contract. Build `models/AttendanceEntry.js`,
`services/attendanceService.js` (every business and permission rule in this one
file, like `userPermissionService.js`), `controllers/attendanceController.js`,
`routes/attendanceRoutes.js`, `validators/attendanceValidators.js`,
`tests/attendance.test.js`.

Verify the `unique` + partial-on-null index actually enforces one open shift on
`mongodb-memory-server` and on the real cluster. `$exists: false` is not a legal
partial filter, so an open shift must store `clockOutAt: null`.

Timestamps are the server's clock everywhere except `POST /attendance` and
`PATCH /attendance/:entryId`, the two manager endpoints that reconstruct a missed
or mistaken entry.

`workedMinutes = floor((clockOutAt - clockInAt) / 60000)`, recomputed on every
write, never from the client. Real tests on a midnight-crossing shift and a
business-day-boundary-crossing shift.

Extend the `skipTenantGuard` tripwire in `tests/menu.test.js` to cover M5 rather
than writing a second one. M5 adds no new use; there are still exactly three.

**What Task C (M0-D) owns, not this session**

The `users.pinHash`, `pinFailedAttempts` and `pinLockedUntil` fields, the PIN
set and reset endpoints, the per-user rate limit and lockout, and the httpOnly
refresh-token cookie. The M5 station endpoint is specified but not implementable
until M0-D ships.

**Unblocked:** M5 server (Task B) has a contract to build against.

**Still open:** M5 has no code. Arya still has not read M1. The Atlas credential
in `claude_code_chat_continue.txt` is still unrotated (Task C).
### 2026-08-30 Rishi, email login

**What was done:** branch `feat/m0/email-login`, off `fix/m0/auth-hardening`.
Email becomes a second login identity alongside phone. The provisioning script
takes a chosen password and an email. Full server suite passes, lint clean,
client builds. Not merged.

**Server**

`POST /auth/login` accepts `{ email, password }` in place of `{ phone,
password }` — exactly one identifier, enforced by the schema. `verifyCredentials`
looks up by whichever was sent; the dummy-hash timing guard and the single
`INVALID_CREDENTIALS` response cover email the same as phone. `authService`
gains `isEmailRegistered`, used by `POST /users`, `PATCH /users/:id` and
provisioning for a clean 409. `users.email` gets a partial unique index
(`$type: 'string'`), so any number of users can have none but two cannot share
one. The login rate limiter keys on phone-or-email. `validators/common.js` gains
a shared `email` primitive.

`scripts/provisionRestaurant.js` takes `--email` and `--password` (both optional,
prompted interactively). The password is still generated when not given, still
printed once, still never stored.

**Client**

The login screen is now one "Phone or email" field: an `@` routes it to the
email path. `authApi.login` and `AuthContext.login` pass the credentials object
straight through.

**What the other developer needs to know**

Phone login is unchanged. Every existing phone-login test still passes.

Email is optional and unique-when-set. Clearing it (`email: null` on
`PATCH /users/:id`) is always allowed.

To make a dev account: `npm run provision:restaurant -- --name "..." --owner
"..." --phone 98XXXXXXXX --email you@example.com --password "one you pick"`.

**Unblocked:** you can sign in with `<team-email>` once this branch
is in the tree you run.

**Still open:** not merged. Sits between `fix/m0/auth-hardening` and the M5
branches in merge order.

### 2026-08-29 Rishi, M0-D auth hardening

**What was done:** three pieces of auth hardening on `fix/m0/auth-hardening`,
branched off `main` so it carries no M5 commits. 203 tests pass, lint clean.
Not merged.

**1. Refresh token moved to an httpOnly cookie.** The contract was edited first,
in its own commit, then the code.

Server: login and refresh set `refreshToken` as an `HttpOnly; Secure;
SameSite=Lax; Path=/api/v1/auth` cookie (`utils/authCookie.js`). Refresh and
logout read it from the cookie, take no body, and require an `X-Requested-With`
header (`middleware/requireCsrfHeader.js`). Logout, logout-all and
change-password clear the cookie. The token value is never in a response body.

Client: `utils/sessionStorage.js` is deleted. `AuthContext` no longer holds a
refresh token; it restores a session by calling refresh and treating a failure
as "no session". `api/client.js` sends `X-Requested-With` on every request.

**2. Staff PIN for the M5 shared-tablet clock.** `users` gains `pinHash`,
`pinFailedAttempts` and `pinLockedUntil` (additive, null-defaulted,
migration-free). `PATCH /api/v1/users/:userId/pin` sets or resets a 4 to 6 digit
PIN, OWNER/MANAGER, a manager cannot touch an owner's PIN.

`authService.verifyPin({ restaurantId, branchId, userId }, pin)` returns
`{ userId }` on success and throws `InvalidPinError` (401) or `PinLockedError`
(429) otherwise. **It issues no token of any kind** — a test asserts the
`RefreshToken` count does not move across a verification. Missing user, no PIN
and wrong PIN fail identically against the dummy hash. Five wrong tries lock it
until a manager reset.

`POST /attendance/station/clock` is **not** wired here. It lives on
`feat/m5/attendance`, and this branch has no attendance module by design. When
M0-D and M5 land together, that route is mounted and calls `verifyPin` plus the
existing clock-in/out logic. `verifyPin`, the PIN storage and the PATCH endpoint
are the whole M0 deliverable and are ready.

**3. Cleanup.** `userController.js` now imports the shared
`utils/escapeRegex.js` instead of a private copy. `claude_code_chat_continue.txt`
is deleted from HEAD; the Atlas credential in it was rotated by hand outside the
session and `.env` updated. The old value is still in git history at 177ed9c — a
full purge is deferred, accepted because the credential is now dead.

**Files created**

`server/utils/authCookie.js`, `server/middleware/requireCsrfHeader.js`.

**Changed in M0**

`docs/API-CONTRACT.md` sections 1.1 to 1.4, 1.6, 3.7 and the token model.
`docs/DB-SCHEMA.md` section 3. `authController.js`, `authRoutes.js`,
`authValidators.js`, `tokenService.js`, `User.js`, `utils/errors.js`,
`services/authService.js`, `services/userPermissionService.js`,
`validators/userValidators.js`, `userController.js`, `userRoutes.js`. Tests:
`auth.test.js`, `users.test.js`, `provisioning.test.js`.

**What the other developer needs to know**

The refresh token is a cookie now. A test that logs in and reads
`body.data.refreshToken` will not find it; read the `Set-Cookie` line instead.

`skipTenantGuard` count is unchanged: still the three from M0. `verifyPin`
filters on `restaurantId` and `branchId`, so it needs no hatch.

**Unblocked:** the pilot blockers "refresh token in localStorage" and "credential
in the repo" are cleared. M5's station endpoint has its PIN dependency.

**Still open:** the branch is not merged. `feat/m5/attendance` needs a rebase
onto this (or a merge order) before the station endpoint can be wired.
### 2026-08-29 Rishi, M2

**What was built:** M2 Order Taking and KOT, all of it. Tables, orders, order
lines, firing, the kitchen display, and five screens. The largest module in the
MVP.

**Endpoints, eighteen, all under `/api/v1`**

Tables: `POST /tables`, `GET /tables`, `PATCH /tables/:tableId`,
`PATCH /tables/:tableId/status`.

Orders: `POST /orders`, `GET /orders`, `GET /orders/:orderId`,
`POST /orders/:orderId/lines`, `PATCH /orders/:orderId/lines/:lineId`,
`POST /orders/:orderId/lines/:lineId/cancel`, `POST /orders/:orderId/fire`,
`PATCH /orders/:orderId/lines/:lineId/served`, `PATCH /orders/:orderId/table`,
`POST /orders/:orderId/cancel`.

Kitchen: `GET /kots`, `GET /kots/:kotId`,
`PATCH /kots/:kotId/lines/:lineId/ready`, `PATCH /kots/:kotId/ready`.

**Four collections:** `counters`, `tables`, `orders`, `kots`. All four apply
`baseSchema` and `tenantGuard` in full. None is a tenancy root.

**The snapshot, which is what this module is for**

Every order line stores its own copy of the item name, the variant name, the
unit price, the tax rate, and each add-on's name and price, taken when the line
was added. Nothing in M2, M3 or M6 reads `menuitems` for a price again.

The client sends ids and a quantity and never a price. The request schema
refuses `unitPriceInPaise`, `taxRateBasisPoints` and anything else outright
rather than stripping it, because a client sending a price is either a bug or
someone pricing their own dinner and both deserve a loud failure.

There is a test that adds a line, raises the menu price and tax rate, reads the
order back, and asserts the line still carries the old numbers. It was also
confirmed by hand against the live cluster.

**Files created**

Models: `Counter.js`, `Table.js`, `Order.js`, `Kot.js`.

Services: `counterService.js`, `orderService.js`, `kitchenService.js`.
Controllers: `tableController.js`, `orderController.js`, `kotController.js`.
Routes: `orderRoutes.js`. Validators: `orderValidators.js`. Utils:
`transaction.js`.

Tests: `tables.test.js`, `orders.test.js`, `kitchen.test.js`, and
`tests/helpers/m2Fixtures.js`. 84 new tests, 281 in the suite, all passing.

Client: `api/orders.js`, `api/kitchen.js`, `features/orders/` with
`FloorViewPage`, `OrderScreenPage`, `TakeawayOrderPage`, `TableManagementPage`,
`MenuPicker`, `OrderLineList`, `LineOptionsPanel`, `CancelPanel` and
`errorCopy.js`, plus `features/kitchen/KitchenDisplayPage`.

**Changed in M0**

`utils/errors.js`, appended: `TABLE_OCCUPIED`, `VERSION_CONFLICT`, their two
classes, and a `details` option on `AppError`.

`middleware/errorHandler.js`: two lines, merging `details` into the failure
envelope. The only M0 file M2 changed beyond `errors.js`, and it was that or
break the contract's error shape.

`client/src/api/client.js`: `ApiError` now keeps the keys it does not
recognise. Without it `existingOrderId` and `currentVersion` arrived from the
server and vanished one line into the client.

`routes/index.js` mounts `orderRoutes`. `App.jsx` and `DashboardPage.jsx` gained
routes and links.

**A bug this found, in M2's own schemas**

Mongoose skips its own `min` and `max` on a null but still runs a custom
validator, and `Number.isInteger(null)` is false. A table created without a seat
count, and a takeaway order with no guest count, both failed validation on the
null the schema itself had just defaulted. Both fields now use a validator that
tolerates an absent value.

**Verified against the real cluster**

The server booted against Atlas and the whole lifecycle ran over HTTP: a table,
an order, three lines with a variant and an add-on, fired to a ticket, the menu
price raised afterwards and the line still showing the old one, a line marked
ready by the kitchen and served, two more lines fired as a second ticket, a
stale write answered with 409 and the current version, everything served, and
the order landing on `READY_TO_BILL` by itself. Two concurrent creates on one
table returned 409 as they should.

The verification restaurant was deleted afterwards, along with everything
scoped to it. The cluster is back to the one real restaurant.

**What the other developer needs to know**

Never read an order, change it in memory and save it. Every write goes through
`applyVersionedUpdate` in `services/orderService.js`, which puts the client's
version in the update filter. The note at the bottom of `models/Order.js` says
this too, because that is where someone would go to "simplify" it.

The partial unique index on `orders` is what makes one open order per table
true. Do not replace it with a `findOne` check in a controller. That is the
race, not the fix.

`isAvailable` on a menu item is checked when a line is added and never again.
An order line is a snapshot, including of the fact that the dish was sellable
at that moment.

A whole-order cancel is OWNER and MANAGER only. A single line cancel is not.
That difference is deliberate and is in the decision log.

M3 sets `orders.billId` and the `BILLED` status. M2 never touches either.

**Unblocked:** M3 Billing. Every line carries the price and tax rate it needs.
M4 also has what it needs from `lines.status` and `lines.wasPrepared`.

**Still open:** a table with a `READY_TO_BILL` order on it reads as free, which
M3 has to settle. See the known problems table.

### 2026-08-29 Rishi, M1 screens

**What was built:** the two M1 screens, and the design language every later
module inherits. M1 is now done, not backend-done.

**Design first, code second**

M1 is the first UI in this project, so the visual language was decided and drawn
before any `.jsx` file was opened. `docs/DESIGN-SYSTEM.md` is the result and is
to the frontend what CONVENTIONS.md is to the backend. Read it before building
a screen.

The reference is what this software replaces: a laminated menu, a kitchen chit,
a thermal bill roll, a stainless counter. Six colours, two type roles, one
signature element.

Saved canvas: https://claude.ai/code/artifact/a65ddd80-2a1a-42d3-84b7-2b26e6cb4040

**Screens**

`/menu`, OWNER and MANAGER. Category rail with inline rename and on/off, a dense
item list, and a slide-over editor carrying variants and add-ons. Not a modal:
someone editing an item needs to glance back at the rail mid-edit.

`/menu/availability`, all six roles. Large tap tiles grouped by category behind
a sticky filter bar, item and variant level. The toggle is optimistic and rolls
back with a plain-language toast on failure.

**Files created**

`api/menu.js`, `features/menu/` with `MenuBuilderPage`, `AvailabilityBoardPage`,
`CategoryRail`, `MenuItemRow`, `ItemEditorPanel`, `SubItemListEditor` and
`errorCopy.js`, plus `components/ui/AvailabilityStamp.jsx` and `Toast.jsx`.

`docs/DESIGN-SYSTEM.md`. Tokens in `client/src/index.css` under `@theme`.

**A bug this found, in M1's own test**

`tests/menu.test.js` has a tripwire asserting M1 added no new use of
`skipTenantGuard`. It was failing on every run on Windows: `readdirSync` with
`recursive` returns the platform separator, so `tests\menu.test.js` never
matched the `tests/` exclusion, and every test file that mentions the hatch was
reported as a violation, including that test itself.

The count it guards was always correct. The test was not. A tripwire that cries
wolf on every run is a tripwire somebody eventually deletes, so it is fixed
rather than left red. It is the only server file this session touched.

**Verified against the real cluster**

Atlas is reachable now, so for the first time in this project the server booted
against it and `GET /api/v1/health` reported `database: "connected"`. A menu was
seeded through the API and every read and write the screens make was exercised
end to end, including variant level availability.

**What the other developer needs to know**

The builder does not read `GET /menu`. That endpoint never returns an inactive
category or item under any query, and the builder exists to switch them back on.
It reads `GET /categories` and `GET /menu-items` with `includeInactive=true`.

`chana`, `mirch` and `patta` are functional colour. Do not reach for one to make
something pop.

Mono is for numbers, Sans for everything else. An item description is prose.

A variant carries its `id` through the editor and back to the server untouched.
That is what keeps an M4 recipe attached when someone renames "Half".

Two tablets on the availability board do not see each other live. See the known
problems table.

**Unblocked:** nothing new, but M2 now has a menu someone can actually edit.

**Still open:** Arya has still not read M1.

### 2026-08-29 Rishi, M1

**What was built:** M1 Menu Management, server side. Categories, menu items,
variants, add-ons, availability, and the menu tree the ordering screen reads.

**The spec was written first, and that was the first commit**

`docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` had no M1 section. DB-SCHEMA.md
said so in as many words. CLAUDE.md forbids inventing their contents, so the
contract and schema were written and committed before any model or route
existed, and the code was then built against them.

If you are picking up M2, read those two files, not the chat this came from.

**Endpoints, eleven, all under `/api/v1`**

`POST /categories`, `GET /categories`, `PATCH /categories/:categoryId`,
`PATCH /categories/:categoryId/active`.

`POST /menu-items`, `GET /menu-items`, `GET /menu-items/:menuItemId`,
`PATCH /menu-items/:menuItemId`, `PATCH /menu-items/:menuItemId/availability`,
`PATCH /menu-items/:menuItemId/active`, `GET /menu`.

Reads are open to all six roles. Writes are OWNER and MANAGER, except
availability, which is open to all six on purpose.

**Files created**

Models: `Category.js`, `MenuItem.js`, plus `models/plugins/jsonTransform.js`.

Controllers: `categoryController.js`, `menuItemController.js`. Routes:
`menuRoutes.js`. Validators: `menuValidators.js`. Utils: `escapeRegex.js`.

Tests: `tests/menu.test.js`, 42 tests. 197 in the suite overall, all passing.

**Changed in M0**

`utils/errors.js`, appended: four codes and four classes. No existing class
touched.

`models/plugins/baseSchema.js`: the `toJSON` transform moved into
`jsonTransform.js` and is now called from there. Behaviour unchanged. This was
necessary because a variant subdocument needs the same transform and cannot
apply `baseSchemaPlugin`.

`routes/index.js`: mounts `menuRoutes`.

**The thing most likely to be broken by a later edit**

Variant and add-on `_id`s are permanent. `PATCH /menu-items/:id` matches
incoming entries to existing subdocuments by id and updates them in place.

The obvious implementation, assigning the request array onto the document, makes
Mongoose mint a fresh `_id` for every entry. Since M4 attaches recipes to a
`variantId` and M2 will store one on an open order line, that version silently
detaches a recipe from its variant the first time a manager renames "Half" to
"Half Plate", and nothing notices until a stock deduction runs weeks later.

`reconcileSubdocuments` in `menuItemController.js` is what prevents it, and
there are four tests on it. Do not simplify it.

**What the other developer needs to know**

`isAvailable` and `isActive` are different fields answering different questions.
"Out of paneer tonight" versus "off the menu". All six roles can set the first,
only owner and manager the second.

There is no DELETE in M1 and there will not be one. `PATCH .../active` is the
delete, because an M3 bill references an item by id forever.

Deactivating a category does not cascade to its items. They keep their own
`isActive` and reappear untouched when the category comes back.

M2 must copy `name`, `priceInPaise` and `taxRateBps` onto the order line at
creation. Do not read them live from the menu at bill time. That is the rule
this whole module exists to serve.

The escape hatch count is unchanged: still exactly three production uses of
`skipTenantGuard`, all from M0. M1 added none, and there is a test asserting it.

**Unblocked:** M2 Order Taking. The menu it reads from exists.

**Still open:** M1 has no React screens, so it is backend-done, not done. Arya
owns this module on paper and has not read the code yet. Both are in the known
problems table.

### 2026-08-29 Rishi, later

**What was built:** M0 part C, staff management. M0 is now DONE.

**Endpoints, all six from docs/API-CONTRACT.md section 3**

`POST /users`, `GET /users`, `GET /users/:userId`, `PATCH /users/:userId`,
`PATCH /users/:userId/status`, `PATCH /users/:userId/password`.

All six are OWNER or MANAGER. There is no DELETE: deactivation replaces it, so
M5 attendance history keeps a user record to point at.

**Files created**

Server: `services/userPermissionService.js`, `validators/userValidators.js`,
`controllers/userController.js`, `routes/userRoutes.js`, `tests/users.test.js`.

Client: `api/users.js`, `components/RequireRole.jsx`, `components/ui/Select.jsx`,
and `features/users/` with the staff list, the add and edit form, the reset
password dialog, the deactivate confirmation, and the role labels.

**Changed in parts A and B**

`utils/errors.js`, appended: `LAST_OWNER`.

`services/authService.js`, extended: it now owns the global phone lookup and
creating a user with a password. `scripts/provisionRestaurant.js` calls the
first of those instead of writing its own unguarded query, which is why the
escape hatch count is still three and not four.

**A bug this found**

`POST /users` stamped `passwordChangedAt` with the current time, as the brief
asked. Combined with the fail-closed second comparison from part B, that
rejected the new user very first access token whenever the login landed in the
same second as the creation. Now null, which is the correct value: there are no
tokens to invalidate for someone who has never signed in.

It was caught by a live end-to-end run, not by the tests. The test asserted the
login returned 200, and the login endpoint does not run the authenticate
middleware, so it never touched the broken path. There is a regression test now
that actually uses the token.

**What the other developer needs to know**

Every staff rule is in `services/userPermissionService.js`. If you need to know
what a manager may do, read that file, not the controllers.

403 means not you. 422 means not this, by anyone. The last-owner rule and the
self-demotion rule are 422 because they bind an owner too.

The frontend never re-implements a permission rule. `RequireRole` hides screens
and the role dropdown hides Owner from a manager, and both say in a comment
that they are convenience only. The last-owner message on screen is whatever
the server said, not a string the client owns.

Search input is escaped before it becomes a regex. If you add another search
box, do the same.

**Unblocked:** M1 Menu Management. M0 is done, so Arya can start.

**Still open:** nothing in M0. The three known problems below are all
environmental or deployment concerns, not M0 work.

### 2026-08-29 Rishi

**What was built:** M0 part B. The four M0 models, the full authentication
flow with refresh token rotation and reuse detection, the restaurant and branch
read endpoints, and the provisioning script.

**Endpoints, all nine from docs/API-CONTRACT.md sections 1 and 2**

`POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`POST /auth/logout-all`, `GET /auth/me`, `PATCH /auth/password`,
`GET /restaurant`, `PATCH /restaurant` (OWNER only), `GET /branches`.

**Files created**

Models: `Restaurant.js`, `Branch.js`, `User.js`, `RefreshToken.js`, plus
`models/plugins/baseSchemaTenantRoot.js` for the branch exception.

Services: `passwordService.js`, `tokenService.js`, `authService.js`.

Controllers: `authController.js`, `restaurantController.js`,
`branchController.js`. Routes: `authRoutes.js`, `restaurantRoutes.js`,
`branchRoutes.js`. Validators: `authValidators.js`, `restaurantValidators.js`.

Script: `scripts/provisionRestaurant.js`, wired to `npm run provision:restaurant`.

Tests: `auth.test.js`, `restaurant.test.js`, `provisioning.test.js`, plus
`tests/helpers/`. 114 tests total, all passing, including the 57 from part A.

Client: `api/authApi.js`, `utils/sessionStorage.js`, and real wiring in
`AuthContext.jsx`, `LoginPage.jsx` and `DashboardPage.jsx`.

**Changed in part A**

`middleware/authenticate.js`, as section 9.3 of the brief asked: it now loads
the user, rejects a deactivated user or restaurant, and rejects an access token
issued before the last password change.

`utils/errors.js`, additively: two new error codes the contract requires.

**A bug this found**

The `passwordChangedAt` check compared whole seconds with `<`, so an access
token issued in the same second as a password change still worked. Narrow, but
it is exactly the window the mechanism exists to close. Now `<=`, which fails
closed. It surfaced as a flaky test, not by reading the code, which is worth
remembering.

**What the other developer needs to know**

There is no signup. Run `npm run provision:restaurant` to create an account. The
password prints once and is not recoverable.

`grep -rn "skipTenantGuard" server/` now returns three production hits, not
zero. All three are lookups that genuinely happen before any tenant is known:
login by phone, refresh by token hash, and the provisioning duplicate check.
Each has a comment saying so. Anything beyond these three needs justifying.

Branches are the tenancy root exception. Do not use `scoped(req)` on them: a
branch has no `branchId` field and `strictQuery` will throw. Filter on
`restaurantId` alone. `Restaurant` has no tenant guard at all, so every query
against it must be by `_id` from a verified token or from the provisioning
script.

Controllers never touch the password hash. `services/authService.js` owns it.

**Unblocked:** M0-C, user management, has everything it needs. So does M1.

**Still open:** M0 is not done until part C ships.

### 2026-08-28 Rishi

**What was built:** M0 part A, the foundation scaffold. Plumbing only. No
business logic, no Mongoose models, no collections, not a single database field.

**Files created**

Repo: `package.json` with npm workspaces, `eslint.config.js`, and a local `.env`
which is gitignored.

Server config: `config/env.js`, `config/database.js`, `config/logger.js`,
`config/roles.js`.

Mongoose plugins, none of them applied to anything yet:
`models/plugins/baseSchema.js`, `softDelete.js`, `tenantGuard.js`.

Middleware, in the CONVENTIONS section 8 order: `middleware/rateLimit.js`,
`authenticate.js`, `tenant.js`, `permission.js`, `validate.js`,
`errorHandler.js`, `notFound.js`.

Utils: `utils/errors.js`, `response.js`, `money.js`, `time.js`,
`scopedQuery.js`, `requestQuery.js`. Validators: `validators/common.js`.

Entry and route: `server.js`, `routes/index.js`, `routes/healthRoutes.js`,
`controllers/healthController.js`.

Tests: `tests/money.test.js`, `tenantGuard.test.js`, `logger.test.js`,
`app.test.js`. 57 tests, all passing.

Client: Vite, React 18, React Router 6, Tailwind 4. `api/client.js`,
`context/AuthContext.jsx`, `components/ProtectedRoute.jsx`,
`components/NotFoundPage.jsx`, `components/ui/` with Button, Input, Spinner,
ErrorMessage and EmptyState, `features/auth/LoginPage.jsx`,
`features/dashboard/DashboardPage.jsx`, `utils/formatDate.js`,
`utils/formatMoney.js`.

**Endpoints:** one. `GET /api/v1/health`. No auth, no tenant, no permission check.

**What the other developer needs to know**

Copy `.env.example` to `.env` and fill it in before anything runs. The server
prints exactly which variables are wrong and exits, rather than starting half
configured.

Every model you write applies `baseSchemaPlugin` and then `tenantGuardPlugin`.
A query that reaches the database without a `restaurantId` filter throws. That
is the point. Build filters with `scoped(req)`.

Never build a response by hand. Use `sendSuccess` and `sendList` in
`utils/response.js`.

Never do arithmetic on money outside `utils/money.js`. Everything is whole paise.

A record belonging to another restaurant returns 404, never 403. A 403 confirms
the record exists.

`grep -rn "skipTenantGuard" server/` is the whole tenant isolation audit. Today
it returns the guard and its own test, and nothing else. Keep it that way.

**Unblocked:** the shape everything else plugs into now exists, so M1 can be
designed against it.

**Still blocked:** M0 part B, meaning users, restaurants, branches and the login
endpoints. It needs `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md`. Neither
exists yet, and neither was invented here.
