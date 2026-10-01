# Current State Audit

Date: 30 September 2026. Revision 2.
Revision 2 changes only the hosting parts. The database stays on Atlas and the Node server runs in the cloud next to it, instead of on a box in the cafe.
Every finding about the code is unchanged from revision 1.
Source: the public snapshot at github.com/Aryapatel-007/Caffeza, commit `0487563`, "Initial snapshot of restaurant ERP code".
Done by: Claude, by cloning the repo and reading the code directly, in place of running Prompt 0 in Claude Code.
The snapshot was copied without git history, on purpose, so some history questions are answered from the docs instead.

---

## 1. Summary

**Overall verdict: CONTINUE ON THIS CODEBASE.**

This is not a half-built project.
Modules M0 to M7 exist, run, and follow the project rules closely.
There are about 15,000 lines of application code and about 10,000 lines of tests.

Three biggest strengths:

1. Money and tax are done properly. Whole paise everywhere, one money file, one tax file, GST per slab, round-off to the rupee, and discount applied before tax. Five real Caffeza bills give the exact same final total in this code.
2. Tenancy and permissions are enforced by the code itself, not by habit. A database query that forgets `restaurantId` throws an error. Every route except login, refresh and health checks the user's role.
3. The hard problems already have written, tested answers. Two waiters on one table, the business day after midnight, gap-free bill numbers inside a transaction, and items cancelled after cooking.

Three biggest problems:

1. One go-live blocker in the code. Database indexes are never built in production, so the guards that stop duplicate bills and double-booked tables would not exist on a fresh production database.
2. Caffeza's daily flows are missing. Platform payment methods, delivery orders, On Hold, No Charge, cash till, day close, and kitchen stations.
3. The reports that exist are correct but are not the ones Caffeza reads. No day close, no category report, no captain report, no cancellation report, no reconciliation checks, no export.

Install: passes.
Lint: passes with zero problems.
Build: passes only when a `.env` file exists. On a clean clone it crashes.
Tests: the 59 money, tax and unit tests pass. The database tests could not run in this sandbox. Run `npm test` on a laptop to confirm the 551 the docs claim.

---

## 2. Repository shape

One repo with npm workspaces: `server` and `client`.

| Part | What it uses |
|---|---|
| Node | 20.19 or newer, from `engines` in `package.json` |
| Package manager | npm, with `package-lock.json` |
| Backend | Express 5, Mongoose 8, Zod 4, pino, helmet, express-rate-limit, bcrypt, jsonwebtoken |
| Frontend | React 18, React Router 6, TanStack Query 5, Tailwind CSS 4, Vite 6 |
| Language | JavaScript with ES modules. No TypeScript. |
| Tests | Node's built-in runner, `node --test`, with `mongodb-memory-server` as a one-member replica set |
| UI library | None. Own components in `client/src/components`. |
| Charts | Hand-built HTML and CSS. No chart library. |

| Folder | Lines | Files |
|---|---|---|
| server/models | 2,735 | 21 |
| server/services | 4,581 | 21 |
| server/controllers | 2,676 | 16 |
| server/routes | 951 | 13 |
| server/middleware | 666 | 8 |
| server/utils | 1,451 | 11 |
| server/validators | 1,774 | 11 |
| server/config | 473 | 4 |
| server/scripts | 1,111 | 2 |
| server/tests | 10,376 | 25 |
| client/src/features | 8,195 | 64 |
| client/src/components | 1,065 | 17 |
| client/src/api | 903 | 11 |
| client/src/utils | 267 | 4 |
| docs | 10,865 | 9 |

| Script | What it runs |
|---|---|
| `npm run dev` | Server and client together, through `concurrently` |
| `npm run dev:server` | Server only, with `nodemon` |
| `npm run dev:client` | Vite dev server |
| `npm start` | `node server.js` |
| `npm test` | `node --env-file=.env.test --test` inside `server` |
| `npm run lint` | ESLint across both workspaces |
| `npm run build` | Vite production build of the client |
| `npm run provision:restaurant` | Creates a restaurant, branch and owner |
| `npm run seed:demo` | Wipes and rebuilds two demo restaurants through the real API |

---

## 3. Git history

The public snapshot has one commit, because history was left out on purpose.
Everything below comes from `docs/PROJECT-STATE.md`.

Every session entry from 28 to 31 August 2026 is written by Rishi.
Pull requests mentioned: #4 and #5.
Branches mentioned: `fix/m0/auth-hardening`, `feat/m0/email-login`, `chore/m5/spec`, `feat/m5/attendance`, `feat/m4/inventory`, `feat/m6/reports`, `feat/m7/restaurant-settings`.

UNVERIFIED: whether M4, M6 and M7 are merged into `main` in the original repo.
The docs say M4 and M6 were "feature-complete on" their feature branches, and M7 on its own branch.
The snapshot contains all three, so the working copy it came from had them.
Check in the original repo with `git branch -a` and `git log main --oneline -20`.

Uncommitted work that was copied into the snapshot:
`docs/API-CONTRACT.md` was modified.
`docs/M1-SUMMARY.md` and `docs/PROJECT-PLAN_1.md` were untracked.

---

## 4. Docs versus code

| Claim in the docs | What the code shows | Match |
|---|---|---|
| M0 to M7 are built | Routes, models, services, screens and tests exist for all eight | Yes |
| All money is whole paise, arithmetic only in `utils/money.js` | No `parseFloat`, `toFixed` or `Decimal128` anywhere in server code | Yes |
| Every model applies `tenantGuardPlugin` | Every model except `Restaurant.js`, which is the tenant itself | Yes |
| Four sanctioned tenant-guard escapes | Exactly four: `authService.js` three times, `tokenService.js` once | Yes |
| Bill numbers are gap-free and reserved in the same transaction | `services/billNumberService.js` refuses to run without a session | Yes |
| GST rounds per slab and CGST takes the odd paisa | `utils/tax.js`, `computeBillTotals` and `splitCgstSgst` | Yes |
| `tax.pricingMode` and `tax.roundOffEnabled` are stored and read by nothing | Round-off is always applied in `utils/tax.js` | Yes |
| The kitchen display polls every ten seconds | `KitchenDisplayPage.jsx` line 28, `refetchInterval: 10_000` | Yes |
| Decision "Web app is online only" | Still stands. The server runs in the cloud, next to Atlas. | Yes |
| Open question "Hosting provider and region" | Settled: a cloud server in the same region as a separate Atlas cluster for Caffeza | Needs updating |
| Open question on recipe unit conversion | Listed twice, and already settled by M4 decision D11 | Needs updating |
| `docs/PROJECT-PLAN_1.md` says M3 to M6 have no contract yet | They do. The file covers only M0 to M2 and is stale. | No |

Decisions in the docs that differ from what Caffeza needs:

| Current decision | What Caffeza needs |
|---|---|
| Bill number is `2026-27/000148`, no prefix, no starting number | A prefix and a starting number, to continue their `CFA/C` series if the CA agrees |
| CGST takes the odd paisa, so CGST and SGST can differ by one paisa | Their current bills always show CGST equal to SGST. The CA decides. |
| Four payment methods: `CASH`, `UPI`, `CARD`, `OTHER` | Nine: Cash, Card, UPI, Zomato Gold, Dineout, EazyDiner, Zomato, Swiggy, plus On Hold |
| Two order types: `DINE_IN`, `TAKEAWAY` | Delivery as well, entered by hand for now |
| Bill-level discount only, flat or percent, owner and manager only | This already fits. Their platform discounts are fixed bill amounts spread across items. Keep it. |

---

## 5. Backend

### 5a. Endpoints

87 routes, all under `/api/v1`.
Every route except the three public ones runs `authenticate`, then `tenant`, then `requireRole`.
Every route validates its input with a Zod schema through `middleware/validate.js`.
Every query goes through `scoped(req)` or `scopedForAggregate`, and the tenant guard throws if one forgets.

| Method | Path | Allowed |
|---|---|---|
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public, needs the refresh cookie and the `X-Requested-With` header |
| POST | `/auth/logout`, `/auth/logout-all` | Signed in |
| GET | `/auth/me` | Signed in |
| PATCH | `/auth/password` | Signed in |
| GET | `/health` | Public |
| GET | `/restaurant` | Signed in |
| PATCH | `/restaurant` | OWNER |
| GET | `/branches` | Signed in |
| GET | `/settings` | OWNER, MANAGER |
| PATCH | `/settings` | OWNER |
| POST, GET | `/users` | OWNER, MANAGER |
| GET, PATCH | `/users/:userId` | OWNER, MANAGER |
| PATCH | `/users/:userId/status`, `/password`, `/pin` | OWNER, MANAGER |
| POST, PATCH | `/categories`, `/categories/:categoryId`, `/categories/:categoryId/active` | OWNER, MANAGER |
| GET | `/categories` | All six roles |
| POST, PATCH | `/menu-items`, `/menu-items/:menuItemId`, `/menu-items/:menuItemId/active` | OWNER, MANAGER |
| GET | `/menu-items`, `/menu-items/:menuItemId`, `/menu` | All six roles |
| PATCH | `/menu-items/:menuItemId/availability` | All six roles |
| POST, PATCH | `/tables`, `/tables/:tableId`, `/tables/:tableId/status` | OWNER, MANAGER |
| GET | `/tables` | All six roles |
| POST | `/orders`, `/orders/:orderId/lines`, `/orders/:orderId/fire` | OWNER, MANAGER, CASHIER, WAITER |
| PATCH | `/orders/:orderId/lines/:lineId`, `/lines/:lineId/served`, `/orders/:orderId/table` | OWNER, MANAGER, CASHIER, WAITER |
| POST | `/orders/:orderId/lines/:lineId/cancel` | OWNER, MANAGER, CASHIER, WAITER |
| POST | `/orders/:orderId/cancel` | OWNER, MANAGER |
| GET | `/orders`, `/orders/:orderId` | All six roles |
| GET | `/kots`, `/kots/:kotId` | All six roles |
| PATCH | `/kots/:kotId/ready`, `/kots/:kotId/lines/:lineId/ready` | All six roles |
| POST, GET | `/bills` | OWNER, MANAGER, CASHIER |
| GET | `/bills/:billId`, `/bills/:billId/receipt` | All six roles |
| POST | `/bills/:billId/payments` | OWNER, MANAGER, CASHIER |
| POST | `/bills/:billId/discount`, `/bills/:billId/void` | OWNER, MANAGER |
| GET | `/bills/summary` | OWNER, MANAGER |
| GET | `/reports/dashboard`, `/sales-summary`, `/sales-by-day`, `/hourly`, `/top-items`, `/tax-summary`, `/discounts`, `/labour-hours` | OWNER, MANAGER |
| GET | `/reports/payment-methods` | OWNER only |
| GET | `/reports/stock-consumption` | OWNER, MANAGER, STOREKEEPER |
| Various | `/ingredients`, `/recipes`, `/inventory/*` (11 routes) | Mostly OWNER, MANAGER, STOREKEEPER |
| Various | `/attendance/*` (10 routes) | Clock actions all six roles, the rest OWNER, MANAGER |

### 5b. Models

| Model | Holds | Notes |
|---|---|---|
| Restaurant | The tenant, its address and `settings` | The tenant root, so no guard. Settings: business day, tax, receipt, inventory. |
| Branch | One branch per restaurant for now | |
| User | Staff, role, phone, optional email, password hash, PIN hash | Deactivated, never deleted |
| RefreshToken | Hashed refresh tokens | |
| Category | Menu section, display order, active flag | No kitchen station field |
| MenuItem | Price in paise, `taxRateBps`, variants, add-ons, availability, active | Tax-exclusive prices |
| Table | Name, active flag | No area and no position on a floor plan |
| Order | Type, table, `guestCount`, customer name and phone, lines, `version`, `openedBy`, `occupiesTable` | Lines snapshot name, price and tax rate |
| Kot | Ticket number, order, lines with status, `firedBy` | One ticket per fire. No station. |
| Counter | Atomic sequences for order, KOT and bill numbers | Bill sequence is per financial year |
| Bill | Number, lines, discount, tax per slab with CGST and SGST, round-off, payments, void fields | See 5d for what it lacks |
| AuditLog | Who did what to a bill | |
| Ingredient, Recipe, StockMovement | Inventory, recipes and an append-only stock ledger | M4 |
| AttendanceEntry | Clock in and out with embedded corrections | M5 |

### 5c. Cross-cutting pieces

| Piece | How it is done |
|---|---|
| Login | Phone or email plus password. JWT access token for 15 minutes. Refresh token in an httpOnly, Secure, SameSite=Lax cookie scoped to `/api/v1/auth`. |
| CSRF | `/auth/refresh` and `/auth/logout` also require the `X-Requested-With` header |
| Password and PIN | bcrypt. PIN locks after five wrong tries until a manager resets it. |
| Role check | `authenticate` reads the role fresh from the database on every request |
| Errors | One envelope, one set of codes in `utils/errors.js`, one handler |
| Logging | pino with pino-http |
| CORS | One allowed origin, `CLIENT_ORIGIN` |
| Headers | helmet |
| Rate limits | Login limiter plus a general limiter, skipped in tests |
| Validation | Zod 4 on every request, and on the environment at boot |
| Mongoose | `strictQuery: 'throw'`, and `autoIndex` off in production |

### 5d. The parts that decide whether reports can be trusted

**Money.**
All arithmetic is in `server/utils/money.js`.
Rounding is half away from zero.
The client has a mirror in `client/src/utils/formatMoney.js` so the two cannot disagree.

**Tax.**
All of it is in `server/utils/tax.js`.
Lines are grouped by tax rate.
A bill discount is shared across the rate groups in proportion, with the leftover paisa given to the largest group.
Tax is worked out once per rate group, then split, with CGST taking the odd paisa.
The total is always rounded to the nearest rupee, between minus 49 and plus 50 paise.

**Tested against five real Caffeza bills from 26 September 2026:**

| Bill | Their total | Our total | Their tax | Our tax |
|---|---|---|---|---|
| C22266, 10% discount | 501 | 501 | 23.86 | 23.85 |
| C22276, Zomato Gold 73.07 off | 1,446 | 1,446 | 68.86 | 68.85 |
| C22262, no discount | 1,061 | 1,061 | 50.50 | 50.50 |
| C22263, no discount | 368 | 368 | 17.50 | 17.50 |
| C22272, includes a water bottle | 753 | 753 | 35.88 | 35.88 |

Every final total matches.
On discounted bills our tax is one paisa lower.
Their system rounds CGST and SGST up separately on each item.
Ours rounds once per rate group.
Both are defensible. The CA picks one, and that choice goes in writing before go-live.

**Bill numbers.**
Format `2026-27/000148`, from `services/billNumberService.js`.
One counter per restaurant, branch and financial year, incremented inside the same transaction that inserts the bill.
A unique index backs it up.
There is no prefix setting and no way to start from a chosen number.

**Business day.**
`settings.businessDayStartsAtMinutes`, default 300, meaning 5:00 AM.
Every bill stores `businessDate` as a `"YYYY-MM-DD"` string at the moment it is billed.
One helper, `businessDateFor` in `utils/time.js`, decides it.

**Transactions.**
Used for bill creation, where they are required, and for KOT firing and provisioning, where there is a fallback.
Bill creation refuses to run on a MongoDB that is not a replica set.
Atlas always runs as a replica set, so this works in production with no extra setup.

**Real-time updates.**
None. The kitchen screen polls every 10 seconds, the floor every 15, the today report every 60.
That is fine at one cafe.

**Printing.**
The bill receipt is plain text built on the server at 32 or 48 columns, from `GET /bills/:billId/receipt`.
The browser prints it through the normal print dialog, from `client/src/features/billing/printReceipt.js`.
There is no direct thermal printer support, no KOT printing, and no printer settings.

**What a bill does not store, and why it matters for reports.**

| Missing from the bill | Where it lives now | Why reports need it on the bill |
|---|---|---|
| Category of each line | Only `menuItemId` | A category report would read today's category. Moving an item to a new category would silently rewrite last month's report. |
| Captain | `openedBy` on the order | Caffeza's captain report |
| Covers | `guestCount` on the order | Occupancy and average per cover |
| Table opened time | `openedAt` on the order | Turnaround time |
| Discount and tax share per line | Only per rate group | Category and item reports that add up exactly to the bill totals |
| Platform, platform order ID, payout | Nowhere | Aggregator reconciliation |

None of the report services read `guestCount` or `openedBy` today.

---

## 6. Frontend

28 routes in `client/src/App.jsx`.
Every screen talks to the real API. No mock data was found.

| Area | Routes |
|---|---|
| Sign in and home | `/login`, `/dashboard` |
| Staff | `/staff`, `/staff/new`, `/staff/:userId/edit` |
| Menu | `/menu`, `/menu/availability` |
| Floor and orders | `/floor`, `/tables`, `/orders/:orderId`, `/orders/takeaway` |
| Kitchen | `/kitchen` |
| Billing | `/bills`, `/bills/:billId` |
| Inventory | `/inventory`, `/inventory/recipes` |
| Attendance | `/attendance`, `/attendance/me`, `/attendance/register` |
| Reports | `/reports`, `/reports/sales`, `/reports/tax`, `/reports/discounts`, `/reports/payments`, `/reports/stock`, `/reports/labour` |
| Settings | `/settings` |

Pieces worth keeping:

| File | Why |
|---|---|
| `api/client.js` | Handles the access token, silent refresh, the CSRF header and the error shape |
| `context/AuthContext.jsx` | Session state |
| `utils/formatMoney.js`, `utils/formatDate.js`, `utils/units.js` | Mirror the server exactly, and dates always display in IST |
| `components/ui/NumericKeypad.jsx` | Large touch keypad for money and quantities |
| `components/charts/*` | Stat tiles, columns, ranked bars, data table |
| `features/*/errorCopy.js` | Turns error codes into plain sentences |

Look and feel:
The repo has its own design system in `docs/DESIGN-SYSTEM.md`.
Six colour tokens: `paper`, `ink`, `steel`, `chana`, `mirch`, `patta`.
IBM Plex Sans for text and IBM Plex Mono for numbers.
A rotated "availability stamp" as the signature element.
Gujarati labels on the billing screen and Hindi labels on the clock screen.
All tokens live in one place, `client/src/index.css` under `@theme`, so changing the look is a small job.
The M0 screens (login, dashboard, staff) still use the older `slate` colours.

---

## 7. Rules compliance

| Rule | Status | Evidence | Fix needed |
|---|---|---|---|
| "Every database record has a restaurantId. Every query filters by it. No exceptions." | PASS | `models/plugins/tenantGuard.js` throws on an unscoped query. Four escapes, pinned by `tests/tenantGuard.test.js`. | None |
| "Store all money as whole paise integers. Never as a decimal or float." | PASS | No float handling found in server code. `utils/money.js` asserts integers. | None |
| "Copy price, item name, and tax rate into the order when it is created. Never read them live from the menu at bill time." | PASS | Order lines carry `itemName`, `unitPriceInPaise`, `taxRateBps`. Bill lines copy them. | Also freeze the category name, see 5d |
| "Check permissions on the server for every endpoint. Hiding a button in React is not security." | PASS | All 84 non-public routes run `requireRole` | None |
| "Never hard delete a bill, order, or stock entry. Mark it cancelled or voided and keep it." | PASS | Only deletes: a KOT rollback when no transaction exists (`services/kitchenService.js` line 173), recipe delete (a documented decision, a recipe is configuration), and rollbacks inside the two scripts | None |
| "Bill numbers are generated on the server, are sequential, and are never reused." | PASS | `services/billNumberService.js`, atomic counter inside the bill transaction | Add a prefix and a starting number for Caffeza |
| "Secrets live in .env. .env is in .gitignore. Never commit a real secret." | PASS in this snapshot | `.gitignore` covers `.env` and `.env.*`. Secret scan is clean. `seedDemo.js` reads `DEMO_PASSWORD`. | The original repo's history still holds a rotated, dead Atlas credential at `177ed9c`. Not in this snapshot. |
| "Store timestamps in UTC. Convert to India time only for display." | PASS with one leak | `utils/time.js` and `client/src/utils/formatDate.js`. Leak: `KitchenDisplayPage.jsx` line 221 uses `toLocaleTimeString()` with no time zone, so it shows the tablet's own zone. | Use `formatDate.js` there |
| "GST rates are settings, never hardcoded." | PASS | Rate is `taxRateBps` per item. `settings.tax.defaultTaxRateBps` defaults to 500, as a setting. | Add tax treatment per order source for platform orders |

| Earlier locked decision | Status | Evidence |
|---|---|---|
| Two waiters: partial unique index on a derived `occupiesTable` boolean | PASS | `models/Order.js`, `OCCUPYING_ORDER_STATUSES` |
| Business day: `businessDayStartsAtMinutes` default 300, date stored as a string | PASS | `models/Restaurant.js`, `utils/time.js`, `bills.businessDate` |
| Stock units: G, ML, PIECE as integers | PASS | `utils/units.js` |
| `wasPrepared` flag on cancelled lines | PASS | `models/Order.js`, order line schema |
| GST per slab, CGST takes the odd paisa, reports sum stored values | PASS | `utils/tax.js`. Reports use stored fields. CA to confirm the split. |
| Staff are deactivated, never deleted | PASS | `PATCH /users/:userId/status`, `isActive` |

---

## 8. Security findings

**CRITICAL:** none found.

**HIGH:**
1. Unique indexes are never built in production. `config/database.js` sets `autoIndex` off when `NODE_ENV=production`, and no script runs `syncIndexes`. On a fresh production database, the guards against two open orders on one table, duplicate bill numbers and double stock deductions would not exist. Fix: an index build script run on every deploy, plus a boot check that refuses to start if a critical index is missing.

**MEDIUM:**
1. `trust proxy` is off in `server.js`. A cloud host puts its own proxy in front of Node, so every device in the cafe looks like the same address. One person failing to sign in would then rate-limit every device. Fix: switch `trust proxy` on for the host's proxy.
2. CORS allows exactly one origin. Fix: serve the client and the API from one domain, so every device uses the same address.

**LOW:**
1. The kitchen screen time zone leak in section 7.
2. `client/vite.config.js` crashes the build with "Invalid URL" when `.env` is missing, because it reads `CLIENT_ORIGIN` unguarded.
3. The hourly report hardcodes `'Asia/Kolkata'` at `services/salesReportService.js` line 195 instead of reading `DISPLAY_TIMEZONE`.
4. The refresh cookie is always `Secure` (`utils/authCookie.js`). That is correct on an https host. It also means testing on a phone over `http://192.168.x.x` signs you out every 15 minutes. Test on `localhost` or the staging URL instead. Never switch `Secure` off.

---

## 9. Tests and build results

| Command | Result |
|---|---|
| `npm ci` | Pass |
| `npm run lint` | Pass, zero problems |
| `npm run build`, no `.env` | FAIL, `TypeError: Invalid URL` from `client/vite.config.js` |
| `npm run build`, with `.env` | Pass. One warning: the main bundle is over 500 kB. |
| `node --test tests/money.test.js tests/tax.test.js tests/units.test.js` | Pass, 59 of 59 |
| Every test that needs MongoDB | Could not run here. The sandbox cannot download the MongoDB binary. Not a fault in the repo. |

Tests exist for money, tax, bill numbers and the business day.
Run `npm test` on a laptop and record the real count.

---

## 10. Hosting: what a cloud server next to Atlas still needs

| Item | Status | What to do |
|---|---|---|
| Indexes in production | Missing | Index build script run on every deploy, and a boot check that refuses to start without the critical indexes |
| Replica set for transactions | Provided by Atlas | Nothing |
| https | Provided by the host | Use one domain for client and API |
| Serving the built client | Missing | `server.js` does not serve `client/dist`. Serve it from Express in production, on the same domain as the API. |
| `trust proxy` | Off | Switch on for the host's proxy |
| Backups | Depends on the Atlas tier | A paid tier with backups switched on, plus a restore drill before go-live |
| Separation from demo data | Missing | A separate Atlas cluster for Caffeza. `seedDemo.js` blocked when `NODE_ENV=production`. |
| Atlas network access | Needs setting | Allow only the server's fixed outbound address |
| Internet at the cafe | Now required for billing | A router with a 4G or 5G backup line |
| Printers | Cannot be reached from the cloud | Bills and KOTs print from the device in the cafe, through the browser. Chrome kiosk printing makes it silent. |
| Restart after a crash | Provided by the host | Pick an always-on service, not serverless |

---

## 11. Module verdicts

Keep the repo's own module numbers.
`docs/BUILD-PLAN.md` section 5 already defines M7 to M15, so Caffeza work reuses M8 and M10 where they overlap, and new modules start at M16.
Revision 1 of this audit proposed M8 to M13 for Caffeza work. Those numbers are withdrawn, because they collide with the build plan.

**Existing modules**

| ID | Module | State | Verdict | What changes for Caffeza | Effort |
|---|---|---|---|---|---|
| M0 | Foundation | WORKING | KEEP WITH CHANGES | Trust the host's proxy. Nothing else. | S |
| M1 | Menu | WORKING | KEEP WITH CHANGES | Bulk import of their menu from a spreadsheet | S |
| M2 | Order Taking and KOT | WORKING | KEEP WITH CHANGES | A fixed list of cancel reasons with an optional note. Block ordering an out-of-stock variant. | S |
| M3 | Billing with GST | WORKING | KEEP WITH CHANGES | Invoice prefix and starting number. Freeze category, captain, covers and opened time onto the bill. Share discount and tax down to each line. | M |
| M4 | Inventory | WORKING | KEEP, SWITCH OFF FOR GO-LIVE | Hidden behind a setting. With no recipes it deducts nothing. | S |
| M5 | Attendance | WORKING | KEEP, SWITCH OFF FOR GO-LIVE | Same as M4 unless Caffeza asks for it | S |
| M6 | Reports and Dashboard | WORKING | KEEP WITH CHANGES | The engine pattern is right. It becomes the base for M19. | M |
| M7 | Restaurant Settings | WORKING | KEEP WITH CHANGES | New setting groups: feature switches, invoice series, stations, payment methods | S |
| M8 | Audit Trail | SPECIFIED, NOT BUILT | BUILD AS SPECIFIED, PULLED FORWARD | The spec in `docs/API-CONTRACT.md` is ready. It feeds the Activity Log report. | M |
| M10 | Payments | NOT STARTED | BUILD, PULLED FORWARD, SCOPE ADJUSTED | Configurable payment methods including platform methods. Split payments already exist in the bill schema. No UPI QR for go-live. | M |

**New modules**

| ID | Module | What it covers | Effort |
|---|---|---|---|
| M16 | Settlement and Day Close | No Charge kept outside sales. On Hold charged to a named account and collected later. Cash till with opening float and paid-outs. Day Close that counts the cash and locks the day. | L |
| M17 | Delivery and Platform Orders | Delivery order type, platform name and order ID, who funded the discount, commission, expected and received payout. Tax treatment per order source, so platform orders bill at 0%. Entered by hand. | M |
| M18 | Kitchen Stations | Stations such as Live Kitchen and Beverages. Each category routed to a station. One KOT per station. Kitchen screen filtered by station, with optional auto-print. | M |
| M19 | Reports v2 | Balance checks, click any number to see its bills, Excel and PDF export, and the Caffeza report list | L |
| M20 | Floor Plan and Look | Areas, a visual table layout, theme settings, the visual refresh | M |

**Phase 2 work, not modules**

Matching `docs/BUILD-PLAN.md` section 7: production safety, printing, hosting and backups, CA sign-off, onboarding the Caffeza menu, and support.

**Deferred until after Caffeza goes live**

M9, M11, M12, M13, M14 and M15, exactly as described in `docs/BUILD-PLAN.md` section 5.

---

## 12. Parts that must not be rewritten

The verdict is to continue, so there is no salvage list.
These are the parts where a rewrite would throw away tested, correct work.

| File | Why it stays |
|---|---|
| `server/utils/money.js` | The only money arithmetic, integer-checked |
| `server/utils/tax.js` | Per-slab GST, discount sharing, round-off. Matches Caffeza's totals. |
| `server/utils/time.js` | The one business day function |
| `server/services/billNumberService.js` | Gap-free numbering inside a transaction |
| `server/models/plugins/tenantGuard.js` and `server/utils/scopedQuery.js` | Tenancy enforced by the database layer |
| `server/utils/transaction.js` | Transactions with a clear rule on when a fallback is allowed |
| `server/services/authService.js`, `tokenService.js` | Login, refresh rotation, PIN lockout |
| `applyVersionedUpdate` in `server/services/orderService.js` | Safe concurrent edits to one order |
| `server/services/stockMovementService.js` | Idempotent stock ledger |
| `server/tests/` | About 550 tests. The safety net for every change above. |

---

## 13. Unknowns

Questions for the team:
1. Are M4, M6 and M7 merged into `main` in the original repo?
2. What does `npm test` report on a laptop?
3. Arya's review of M1, M4, M5, M6 and M7 is still outstanding, per `docs/PROJECT-STATE.md`. This audit is not a line-by-line review.
4. Keep the current design system as the base, or replace it?

Questions for Caffeza:
1. Printed KOTs, kitchen screens, or both? How many stations?
   A cloud server cannot reach a printer in the cafe, so any printing happens from a device inside the cafe.
2. Printer models, and are they USB or network?
3. Can their current system export the menu to a spreadsheet?
4. Do they want inventory or attendance at launch?

Questions for their CA:
1. CGST and SGST split: one rounding per rate group, or each half rounded per item as today?
2. Continue the `CFA/C` invoice series, or start a new one?
3. Platform delivery orders at 0% under section 9(5): confirm.
4. How No Charge orders should be recorded.

---

## 14. Not covered

1. The client screens were read by structure, not line by line.
2. The database tests were not run.
3. `docs/API-CONTRACT.md` and `docs/DB-SCHEMA.md` were spot-checked against the code, not compared in full.
4. Nothing was tried on a real thermal printer or a tablet.
